/*
 * Copyright 2026 The Ray Optics Simulation authors and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  convertParsedZemaxToModule,
  createZemaxLibraryRecord,
  decodeZemaxBuffer,
  makeUniqueModuleName,
  parseZemaxText,
  sanitizeModuleName,
} from '../../src/app/utils/zemaxImport.js';

const SAMPLE_ZMX_TEXT = `VERS 171115
MODE SEQ
NAME 65438 Achromatic Lens
NOTE 0 LENS ACH NIR 25 X 30 NIR II TS
UNIT MM X W X CM MR CPMM
SURF 0
  CURV 0.0
  DISZ INFINITY
  MEMA 0 0 0 0 1 ""
SURF 1
  COMM 65438
  STOP
  CURV 5.042864346949069848E-02
  COAT EO_NIRII_673
  DISZ 11
  GLAS N-LAK14
  DIAM 12 1 0 0 1 ""
  OEMA 0.5 0 0 0 0 ""
  MEMA 12.5 0 0 0 1 ""
  CLAP 0 12 0
SURF 2
  CURV -4.938271604938269943E-02
  DISZ 3
  GLAS N-SF66
  DIAM 12 1 0 0 1 ""
  OEMA 0.5 0 0 0 0 ""
  MEMA 12.5 0 0 0 1 ""
  FLAP 0 12 0
SURF 3
  CURV -1.006846556584779957E-02
  COAT EO_NIRII_785
  DISZ 21.955518323527404
  MAZH 0 0
  DIAM 12 1 0 0 1 ""
  OEMA 0.5 0 0 0 0 ""
  MEMA 12.5 0 0 0 1 ""
  CLAP 0 12 0
SURF 4
  CURV 0.0
  DISZ 0
  MEMA 0 0 0 0 1 ""`;

describe('zemaxImport', () => {
  it('decodes UTF-16LE .zmx content', () => {
    const bytes = Buffer.from(`\uFEFF${SAMPLE_ZMX_TEXT}`, 'utf16le');
    const decoded = decodeZemaxBuffer(bytes);
    expect(decoded).toContain('NAME 65438 Achromatic Lens');
    expect(decoded).toContain('GLAS N-LAK14');
  });

  it('parses the sample-like Zemax sequential lens file', () => {
    const parsed = parseZemaxText(SAMPLE_ZMX_TEXT);

    expect(parsed.mode).toBe('SEQ');
    expect(parsed.name).toBe('65438 Achromatic Lens');
    expect(parsed.unitCode).toBe('MM');
    expect(parsed.surfaces).toHaveLength(5);
    expect(parsed.surfaces[1].glassName).toBe('N-LAK14');
    expect(parsed.surfaces[1].stop).toBe(true);
    expect(parsed.surfaces[1].clearSemiDiameter).toBe(12);
    expect(parsed.surfaces[2].vertexX).toBe(11);
    expect(parsed.surfaces[1].curvature).toBeCloseTo(0.0504286434694907);
    expect(parsed.surfaces[2].glassName).toBe('N-SF66');
    expect(parsed.warnings.some((warningText) => warningText.includes('coating metadata'))).toBe(true);
  });

  it('rejects unsupported geometry-affecting surface records', () => {
    const unsupported = `${SAMPLE_ZMX_TEXT}\nSURF 5\n  XDAT 1`;
    expect(() => parseZemaxText(unsupported)).toThrow(/Unsupported Zemax surface record "XDAT"/);
  });

  it('converts the sample-like lens into a reusable module definition', () => {
    const parsed = parseZemaxText(SAMPLE_ZMX_TEXT);
    const converted = convertParsedZemaxToModule(parsed);

    expect(converted.moduleDef.numPoints).toBe(2);
    expect(converted.moduleDef.vars.some((expression) => expression.includes('scaleFactor'))).toBe(false);
    expect(converted.moduleDef.params).toEqual(
      expect.arrayContaining([
        'n_1=0.5:0.01:2.5:1.6968',
        'B_1=0.0001:0.0001:0.02:0.0066',
        'n_2=0.5:0.01:2.5:1.92286',
        'B_2=0.0001:0.0001:0.0231:0.0231',
      ])
    );
    expect(converted.moduleDef.objs.filter((obj) => obj.type === 'Glass')).toHaveLength(2);
    expect(converted.metadataSummary.glassNames).toEqual(['N-LAK14', 'N-SF66']);
    expect(converted.metadataSummary.totalLength).toBe(14);
  });

  it('imports the real EVENASPH sample into an analytic aspheric glass module', () => {
    const sampleBuffer = fs.readFileSync(path.resolve(process.cwd(), 'zmx/AL2520M-B-Zemax-ZMX.zmx'));
    const parsed = parseZemaxText(decodeZemaxBuffer(sampleBuffer));
    const converted = convertParsedZemaxToModule(parsed);

    expect(parsed.surfaces[1].type).toBe('EVENASPH');
    expect(parsed.surfaces[1].conic).toBeCloseTo(-1.35);
    expect(parsed.surfaces[1].asphereCoefficients[2]).toBeCloseTo(2.361813418595e-8);
    expect(parsed.surfaces[2].vertexX).toBe(7.6);
    expect(converted.moduleDef.objs).toHaveLength(1);
    expect(converted.moduleDef.objs[0].type).toBe('AsphericGlass');
    expect(converted.moduleDef.objs[0].frontConic).toBeCloseTo(-1.35);
    expect(converted.moduleDef.objs[0].frontCoefficients[2]).toBeCloseTo(2.361813418595e-8);
    expect(converted.moduleDef.objs[0].rimSemiDiameter).toBeCloseTo(12.5);
    expect(converted.moduleDef.objs[0].blockOuterRim).toBe(true);
    expect(converted.moduleDef.objs[0].p1.x).toContain('x_1');
    expect(converted.moduleDef.objs[0].p2.x).toContain('x_1');
    expect(converted.metadataSummary.glassNames).toEqual(['S-LAH64']);
    expect(converted.metadataSummary.totalLength).toBe(7.6);
    expect(converted.warnings.some((warningText) => warningText.includes('sampled line-segment outlines'))).toBe(false);
    expect(converted.warnings.some((warningText) => warningText.includes('blocked cylindrical rim'))).toBe(true);
  });

  it('uses bundled glass defaults for SCHOTT N-LAK22 and N-SF6 instead of fallback material values', () => {
    const sampleBuffer = fs.readFileSync(path.resolve(process.cwd(), 'zmx/zmax_45803.zmx'));
    const parsed = parseZemaxText(decodeZemaxBuffer(sampleBuffer));
    const converted = convertParsedZemaxToModule(parsed);

    expect(converted.metadataSummary.glassNames).toEqual(['N-LAK22', 'N-SF6']);
    expect(converted.warnings.some((warningText) => warningText.includes('fallback refractive data'))).toBe(false);
    expect(converted.moduleDef.params).toEqual(
      expect.arrayContaining([
        'n_1=0.5:0.01:2.5:1.65113',
        'B_1=0.0001:0.0001:0.02:0.0061',
        'n_2=0.5:0.01:2.5:1.80518',
        'B_2=0.0001:0.0001:0.02:0.0166',
      ])
    );
  });

  it('supports glass names that map to the current SCHOTT N-LASF31A designation', () => {
    expect(createZemaxLibraryRecord({
      fileName: 'sample.zmx',
      sourceText: SAMPLE_ZMX_TEXT.replace('GLAS N-LAK14', 'GLAS N-LASF31A'),
      now: () => '2026-04-17T00:00:00.000Z',
    }).moduleDef.params).toEqual(
      expect.arrayContaining([
        'n_1=0.5:0.01:2.5:1.883',
        'B_1=0.0001:0.0001:0.02:0.0113',
      ])
    );
  });

  it('falls back to editable default material values for unknown glasses', () => {
    const unknownGlassText = SAMPLE_ZMX_TEXT.replace('GLAS N-SF66', 'GLAS UNKNOWN_GLASS');
    const record = createZemaxLibraryRecord({
      fileName: 'sample.zmx',
      sourceText: unknownGlassText,
      now: () => '2026-04-17T00:00:00.000Z',
    });

    expect(record.diagnostics.warnings.some((warningText) => warningText.includes('UNKNOWN_GLASS'))).toBe(true);
    expect(record.moduleDef.params).toEqual(
      expect.arrayContaining([
        'n_2=0.5:0.01:2.5:1.5',
        'B_2=0.0001:0.0001:0.02:0.004',
      ])
    );
  });

  it('sanitizes and uniquifies imported module names', () => {
    const baseName = sanitizeModuleName('65438 Achromatic Lens', 'sample.zmx');
    expect(baseName).toBe('Zmx65438AchromaticLens');
    expect(makeUniqueModuleName(baseName, [baseName, `${baseName}2`])).toBe(`${baseName}3`);
  });
});
