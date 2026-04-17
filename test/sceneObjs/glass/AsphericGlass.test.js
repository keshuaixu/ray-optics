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

import Scene from '../../../src/core/Scene.js';
import AsphericGlass from '../../../src/core/sceneObjs/glass/AsphericGlass.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  convertParsedZemaxToModule,
  decodeZemaxBuffer,
  parseZemaxText,
} from '../../../src/app/utils/zemaxImport.js';

describe('AsphericGlass', () => {
  let scene;

  beforeEach(() => {
    scene = new Scene();
  });

  it('intersects a centered paraboloid front surface at the analytic sag location', () => {
    const obj = new AsphericGlass(scene, {
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      frontSemiDiameter: 5,
      backSemiDiameter: 5,
      frontCurvature: 0.1,
      backCurvature: 0,
      frontConic: -1,
      backConic: 0,
      frontCoefficients: [],
      backCoefficients: [],
      refIndex: 1.5,
      cauchyB: 0.004,
    });

    const ray = {
      p1: { x: -10, y: 2 },
      p2: { x: 20, y: 2 },
    };

    const intersection = obj.checkRayIntersects(ray);

    expect(intersection).toBeTruthy();
    expect(intersection.x).toBeCloseTo(0.2, 8);
    expect(intersection.y).toBeCloseTo(2, 8);
    expect(obj.getIncidentType(ray)).toBe(-1);
  });

  it('uses a blocked cylindrical rim when configured', () => {
    const obj = new AsphericGlass(scene, {
      p1: { x: 0, y: 0 },
      p2: { x: 7.6, y: 0 },
      frontSemiDiameter: 12.5,
      backSemiDiameter: 10,
      rimSemiDiameter: 12.5,
      blockOuterRim: true,
      frontCurvature: 0,
      backCurvature: 0,
      frontConic: 0,
      backConic: 0,
      frontCoefficients: [],
      backCoefficients: [],
      refIndex: 1.5,
      cauchyB: 0.004,
    });

    const outline = obj.getOutlinePath();
    const topY = Math.min(...outline.map((point) => point.y));
    const backShoulderPoint = outline.find((point) => Math.abs(point.x - 7.6) < 1e-9 && Math.abs(point.y + 10) < 1e-9);
    expect(topY).toBeCloseTo(-12.5, 8);
    expect(backShoulderPoint).toBeTruthy();

    const ray = {
      p1: { x: 1, y: 11 },
      p2: { x: 20, y: 11 },
      brightness_s: 1,
      brightness_p: 0,
      wavelength: 540,
      gap: false,
    };

    const incidentPoint = obj.checkRayIntersects(ray);
    expect(incidentPoint.x).toBeCloseTo(7.6, 8);
    expect(incidentPoint.y).toBeCloseTo(11, 8);

    const result = obj.onRayIncident(ray, 0, incidentPoint, []);
    expect(result).toEqual({ isAbsorbed: true });
  });

  it('refracts through the imported mounted asphere and exits forward through the back face', () => {
    const sampleBuffer = fs.readFileSync(path.resolve(process.cwd(), 'zmx/AL2520M-B-Zemax-ZMX.zmx'));
    const parsed = parseZemaxText(decodeZemaxBuffer(sampleBuffer));
    const converted = convertParsedZemaxToModule(parsed);
    const importedObj = converted.moduleDef.objs[0];
    const obj = new AsphericGlass(scene, {
      ...importedObj,
      p1: { x: 0, y: 0 },
      p2: { x: 7.6, y: 0 },
      refIndex: 1.788,
      cauchyB: 0.004,
      partialReflect: false,
    });
    const ray = {
      p1: { x: -20, y: 4 },
      p2: { x: 40, y: 4 },
      brightness_s: 1,
      brightness_p: 0,
      wavelength: 550,
      gap: false,
    };

    const entry = obj.getIncidentData(ray);
    expect(entry.s_point).toBeTruthy();
    expect(entry.incidentType).toBe(-1);
    expect(entry.s_point.x).toBeLessThan(7.6);
    obj.onRayIncident(ray, 0, entry.s_point, []);

    const exit = obj.getIncidentData(ray);
    expect(exit.s_point).toBeTruthy();
    expect(exit.boundaryType).toBeUndefined();
    expect(exit.incidentType).toBe(1);
    expect(exit.s_point.x).toBeCloseTo(7.6, 8);
    obj.onRayIncident(ray, 0, exit.s_point, []);

    expect(ray.p2.x).toBeGreaterThan(ray.p1.x);
    expect(obj.checkRayIntersects(ray)).toBeFalsy();
  });
});
