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

import { ZEMAX_GLASS_CATALOG } from './zemaxGlassCatalog.js';

export const ZEMAX_DEFAULT_GLASS = Object.freeze({
  refIndex: 1.5,
  cauchyB: 0.004,
});

const SAFE_TOP_LEVEL_KEYWORDS = new Set([
  'VERS', 'DBDT', 'MODE', 'NAME', 'NOTE', 'PFIL', 'LANG', 'UNIT', 'ENPD',
  'ENVD', 'GFAC', 'GCAT', 'SDMA', 'OMMA', 'FTYP', 'ROPD', 'HYPR', 'PICB',
  'XFLN', 'YFLN', 'FWGN', 'WAVM', 'PWAV', 'GLRS', 'RAIM', 'PUSH', 'VDXN',
  'VDYN', 'VCXN', 'VCYN', 'VANN', 'POLS', 'GSTD', 'NSCD', 'COFN', 'BLNK',
  'RCMF', 'TOL', 'MNUM', 'MOFF'
]);

const SAFE_SURFACE_KEYWORDS = new Set([
  'COMM', 'STOP', 'TYPE', 'FIMP', 'CURV', 'COAT', 'HIDE', 'MIRR', 'SLAB',
  'PARM', 'DISZ', 'GLAS', 'CONI', 'DIAM', 'OEMA', 'MEMA', 'CLAP', 'FLAP',
  'MAZH', 'POPS'
]);

const SUPPORTED_SURFACE_TYPES = new Set([
  'STANDARD',
  'EVENASPH',
]);

const UNIT_SCALE_MM = Object.freeze({
  MM: 1,
  CM: 10,
  M: 1000,
  IN: 25.4,
});

export const ZEMAX_SIMULATOR_UNITS_PER_MM = 1;

function normalizeKeyword(keyword) {
  return (keyword || '').trim().toUpperCase();
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return `${value}`;
  }
  if (Object.is(value, -0)) {
    return '0';
  }
  return `${Number.parseFloat(value.toPrecision(15))}`;
}

function formatParamUpperBound(value, minimum) {
  if (!Number.isFinite(value)) {
    return formatNumber(minimum);
  }
  return formatNumber(Math.max(minimum, Math.ceil(value * 10000) / 10000));
}

function scaleLength(value, scale) {
  return Number.isFinite(value) ? value * scale : value;
}

function textDecoderDecode(bytes, encoding, offset = 0) {
  return new TextDecoder(encoding).decode(bytes.subarray(offset));
}

function looksLikeUtf16Le(bytes) {
  if (bytes.length < 4) {
    return false;
  }
  let zeroCount = 0;
  let sampleCount = 0;
  for (let index = 1; index < Math.min(bytes.length, 128); index += 2) {
    sampleCount++;
    if (bytes[index] === 0) {
      zeroCount++;
    }
  }
  return sampleCount > 0 && zeroCount / sampleCount > 0.6;
}

function looksLikeUtf16Be(bytes) {
  if (bytes.length < 4) {
    return false;
  }
  let zeroCount = 0;
  let sampleCount = 0;
  for (let index = 0; index < Math.min(bytes.length, 128); index += 2) {
    sampleCount++;
    if (bytes[index] === 0) {
      zeroCount++;
    }
  }
  return sampleCount > 0 && zeroCount / sampleCount > 0.6;
}

function parseNumericToken(rawValue, context) {
  const value = Number.parseFloat(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value for ${context}: "${rawValue}"`);
  }
  return value;
}

function parseNumericList(rawValue) {
  if (!rawValue) {
    return [];
  }
  return rawValue
    .split(/\s+/)
    .map((token) => Number.parseFloat(token))
    .filter((value) => Number.isFinite(value));
}

function getMechanicalSemiDiameter(surface) {
  return surface.mechSemiDiameter ?? surface.diamSemiDiameter ?? surface.clearSemiDiameter ?? null;
}

function inferBlockedCylindricalRimSemiDiameter(frontSurface, backSurface) {
  const frontPhysicalSemiDiameter = getMechanicalSemiDiameter(frontSurface);
  const backPhysicalSemiDiameter = getMechanicalSemiDiameter(backSurface);
  if (!(frontPhysicalSemiDiameter > 0) || !(backPhysicalSemiDiameter > 0)) {
    return null;
  }
  if (Math.abs(frontPhysicalSemiDiameter - backPhysicalSemiDiameter) <= 1e-9) {
    return null;
  }
  if (frontSurface.mechSemiDiameter != null || backSurface.mechSemiDiameter != null) {
    return null;
  }

  const smallerSurface = frontPhysicalSemiDiameter < backPhysicalSemiDiameter ? frontSurface : backSurface;
  if (Math.abs(smallerSurface.curvature ?? 0) >= 1e-12) {
    return null;
  }

  return Math.max(frontPhysicalSemiDiameter, backPhysicalSemiDiameter);
}

function getAsphereCoefficientExponent(paramIndex) {
  return paramIndex * 2;
}

function scaleAsphereCoefficient(value, paramIndex, unitScale) {
  return value / Math.pow(unitScale, getAsphereCoefficientExponent(paramIndex) - 1);
}

function getAsphereCoefficients(surface) {
  return Array.isArray(surface.asphereCoefficients) ? surface.asphereCoefficients : [];
}

function hasAsphereTerms(surface) {
  return getAsphereCoefficients(surface).some((coefficient, index) => {
    return index > 0 && Number.isFinite(coefficient) && Math.abs(coefficient) > 1e-18;
  });
}

function surfaceRequiresAsphericPrimitive(surface) {
  return normalizeKeyword(surface.type) !== 'STANDARD'
    || Math.abs(surface.conic ?? 0) > 1e-12
    || hasAsphereTerms(surface);
}

function surfaceSagAtSemiDiameter(surface, semiDiameter) {
  const curvature = surface.curvature ?? 0;
  const conic = surface.conic ?? 0;
  let sag = 0;

  if (Math.abs(curvature) >= 1e-12) {
    const radicand = 1 - (1 + conic) * curvature * curvature * semiDiameter * semiDiameter;
    if (radicand < -1e-9) {
      throw new Error(`Semi-diameter ${semiDiameter} exceeds the supported sag domain on surface ${surface.index}.`);
    }
    sag = curvature * semiDiameter * semiDiameter / (1 + Math.sqrt(Math.max(0, radicand)));
  }

  getAsphereCoefficients(surface).forEach((coefficient, index) => {
    if (index === 0 || !Number.isFinite(coefficient) || Math.abs(coefficient) <= 1e-18) {
      return;
    }
    sag += coefficient * Math.pow(semiDiameter, getAsphereCoefficientExponent(index));
  });

  return sag;
}

function surfaceXAtY(surface, y) {
  return surface.vertexX + surfaceSagAtSemiDiameter(surface, Math.abs(y));
}

function makePointExpr(localX, localY) {
  const x = formatNumber(localX);
  const y = formatNumber(localY);
  return {
    x: `\`x_1 + ((${x})*axisUnitX + (${y})*normalUnitX)\``,
    y: `\`y_1 + ((${x})*axisUnitY + (${y})*normalUnitY)\``,
  };
}

function sanitizeIdentifierPart(value) {
  return (value || '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export function sanitizeModuleName(displayName, fileName = '') {
  const preferred = sanitizeIdentifierPart(displayName);
  const fallback = sanitizeIdentifierPart(fileName.replace(/\.[^.]+$/, ''));
  let moduleName = preferred || fallback || 'ImportedZemaxPart';
  if (!/^[A-Za-z_]/.test(moduleName)) {
    moduleName = `Zmx${moduleName}`;
  }
  return moduleName;
}

export function makeUniqueModuleName(baseName, existingNames = []) {
  const used = new Set(existingNames.filter(Boolean));
  if (!used.has(baseName)) {
    return baseName;
  }
  let suffix = 2;
  while (used.has(`${baseName}${suffix}`)) {
    suffix++;
  }
  return `${baseName}${suffix}`;
}

export function createLibraryRecordId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `zemax-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function decodeZemaxBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let text;

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = textDecoderDecode(bytes, 'utf-16le', 2);
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = textDecoderDecode(bytes, 'utf-16be', 2);
  } else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    text = textDecoderDecode(bytes, 'utf-8', 3);
  } else if (looksLikeUtf16Le(bytes)) {
    text = textDecoderDecode(bytes, 'utf-16le');
  } else if (looksLikeUtf16Be(bytes)) {
    text = textDecoderDecode(bytes, 'utf-16be');
  } else {
    text = textDecoderDecode(bytes, 'utf-8');
  }

  return text.replace(/^\uFEFF/, '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
}

function createEmptySurface(index) {
  return {
    index,
    comment: '',
    stop: false,
    type: 'STANDARD',
    curvature: 0,
    conic: 0,
    asphereCoefficients: [],
    thickness: 0,
    glassName: null,
    coat: null,
    diamSemiDiameter: null,
    mechSemiDiameter: null,
    clearSemiDiameter: null,
  };
}

export function parseZemaxText(text) {
  const warnings = [];
  const notes = [];
  const surfaces = [];
  const ignoredSurfaceMetadata = new Set();

  let name = '';
  let mode = null;
  let unitCode = 'MM';
  let currentSurface = null;

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    const firstSpace = trimmed.indexOf(' ');
    const keyword = normalizeKeyword(firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace));
    const rawValue = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim();
    const isIndented = /^\s/.test(rawLine);

    if (currentSurface && !isIndented && keyword !== 'SURF') {
      surfaces.push(currentSurface);
      currentSurface = null;
    }

    if (keyword === 'SURF') {
      if (currentSurface) {
        surfaces.push(currentSurface);
      }
      currentSurface = createEmptySurface(parseNumericToken(rawValue, 'SURF index'));
      continue;
    }

    if (currentSurface) {
      if (!SAFE_SURFACE_KEYWORDS.has(keyword)) {
        throw new Error(`Unsupported Zemax surface record "${keyword}" on surface ${currentSurface.index}.`);
      }

      switch (keyword) {
        case 'COMM':
          currentSurface.comment = rawValue;
          break;
        case 'STOP':
          currentSurface.stop = true;
          break;
        case 'TYPE': {
          const surfaceType = normalizeKeyword(rawValue.split(/\s+/)[0]);
          if (!SUPPORTED_SURFACE_TYPES.has(surfaceType)) {
            throw new Error(`Unsupported Zemax surface type "${surfaceType}" on surface ${currentSurface.index}.`);
          }
          currentSurface.type = surfaceType;
          break;
        }
        case 'CURV':
          currentSurface.curvature = parseNumericToken(rawValue, `CURV on surface ${currentSurface.index}`);
          break;
        case 'DISZ':
          currentSurface.thickness = rawValue.toUpperCase() === 'INFINITY'
            ? Number.POSITIVE_INFINITY
            : parseNumericToken(rawValue, `DISZ on surface ${currentSurface.index}`);
          break;
        case 'GLAS':
          currentSurface.glassName = (rawValue.split(/\s+/)[0] || '').trim() || null;
          break;
        case 'CONI':
          currentSurface.conic = parseNumericToken(rawValue, `CONI on surface ${currentSurface.index}`);
          break;
        case 'PARM': {
          const values = rawValue.split(/\s+/);
          const paramIndex = Number.parseInt(values[0], 10);
          if (!Number.isInteger(paramIndex) || paramIndex < 1) {
            throw new Error(`Invalid EVENASPH parameter index on surface ${currentSurface.index}.`);
          }
          if (currentSurface.type !== 'EVENASPH') {
            throw new Error(`Unsupported Zemax PARM record on non-EVENASPH surface ${currentSurface.index}.`);
          }
          currentSurface.asphereCoefficients[paramIndex] = parseNumericToken(values[1] ?? '0', `PARM ${paramIndex} on surface ${currentSurface.index}`);
          break;
        }
        case 'COAT':
          currentSurface.coat = rawValue;
          break;
        case 'DIAM': {
          const values = parseNumericList(rawValue);
          currentSurface.diamSemiDiameter = values[0] ?? null;
          break;
        }
        case 'MEMA': {
          const values = parseNumericList(rawValue);
          currentSurface.mechSemiDiameter = values[0] ?? null;
          break;
        }
        case 'CLAP':
        case 'FLAP': {
          const values = parseNumericList(rawValue);
          currentSurface.clearSemiDiameter = values[1] ?? values[0] ?? null;
          break;
        }
        case 'MAZH': {
          const values = parseNumericList(rawValue);
          if (values.some((value) => Math.abs(value) > 1e-12)) {
            throw new Error(`Unsupported decenter/aperture offset on surface ${currentSurface.index}.`);
          }
          break;
        }
        case 'OEMA':
          ignoredSurfaceMetadata.add('OEMA');
          break;
        case 'HIDE':
        case 'MIRR':
        case 'SLAB':
        case 'POPS':
          ignoredSurfaceMetadata.add(keyword);
          break;
        case 'FIMP':
          break;
      }

      continue;
    }

    if (!SAFE_TOP_LEVEL_KEYWORDS.has(keyword)) {
      warnings.push(`Ignored unsupported top-level Zemax keyword "${keyword}".`);
      continue;
    }

    switch (keyword) {
      case 'MODE':
        mode = normalizeKeyword(rawValue);
        break;
      case 'NAME':
        name = rawValue;
        break;
      case 'NOTE':
        notes.push(rawValue.replace(/^\d+\s+/, ''));
        break;
      case 'UNIT': {
        const code = normalizeKeyword(rawValue.split(/\s+/)[0]);
        if (!UNIT_SCALE_MM[code]) {
          throw new Error(`Unsupported Zemax unit "${code}".`);
        }
        unitCode = code;
        break;
      }
    }
  }

  if (currentSurface) {
    surfaces.push(currentSurface);
  }

  if (mode !== 'SEQ') {
    throw new Error(`Only sequential Zemax files are supported. Found mode "${mode || 'UNKNOWN'}".`);
  }
  if (surfaces.length < 2) {
    throw new Error('The Zemax file does not contain enough surfaces to import.');
  }

  const unitScale = UNIT_SCALE_MM[unitCode] * ZEMAX_SIMULATOR_UNITS_PER_MM;

  for (const surface of surfaces) {
    surface.curvature /= unitScale;
    surface.asphereCoefficients = getAsphereCoefficients(surface).map((coefficient, index) => {
      if (index === 0 || !Number.isFinite(coefficient)) {
        return coefficient;
      }
      return scaleAsphereCoefficient(coefficient, index, unitScale);
    });
    surface.thickness = scaleLength(surface.thickness, unitScale);
    surface.diamSemiDiameter = scaleLength(surface.diamSemiDiameter, unitScale);
    surface.mechSemiDiameter = scaleLength(surface.mechSemiDiameter, unitScale);
    surface.clearSemiDiameter = scaleLength(surface.clearSemiDiameter, unitScale);
  }

  const anchorIndex = surfaces.findIndex((surface) => Number.isFinite(surface.thickness));
  if (anchorIndex === -1) {
    throw new Error('Unable to anchor Zemax surface positions because every leading thickness is infinite.');
  }

  surfaces[anchorIndex].vertexX = 0;

  for (let index = anchorIndex + 1; index < surfaces.length; index++) {
    const prev = surfaces[index - 1];
    if (!Number.isFinite(prev.thickness)) {
      throw new Error(`Surface ${prev.index} has infinite thickness inside the supported import range.`);
    }
    surfaces[index].vertexX = surfaces[index - 1].vertexX + prev.thickness;
  }

  for (let index = anchorIndex - 1; index >= 0; index--) {
    const thickness = surfaces[index].thickness;
    surfaces[index].vertexX = Number.isFinite(thickness)
      ? surfaces[index + 1].vertexX - thickness
      : Number.NEGATIVE_INFINITY;
  }

  const metadataWarnings = [];
  if (ignoredSurfaceMetadata.size > 0) {
    metadataWarnings.push(`Ignored surface metadata: ${Array.from(ignoredSurfaceMetadata).sort().join(', ')}.`);
  }
  if (surfaces.some((surface) => surface.coat)) {
    metadataWarnings.push('Surface coating metadata was preserved in the library entry but not converted into simulator optics.');
  }
  if (notes.length > 0) {
    metadataWarnings.push('Zemax notes were preserved in the library entry metadata only.');
  }

  return {
    name,
    notes,
    mode,
    unitCode,
    unitScale,
    surfaces,
    warnings: warnings.concat(metadataWarnings),
  };
}

function lookupGlass(glassName) {
  if (!glassName) {
    return null;
  }
  return ZEMAX_GLASS_CATALOG[glassName.toUpperCase()] || null;
}

function createSurfaceSummary(surface) {
  return {
    index: surface.index,
    comment: surface.comment || '',
    type: surface.type,
    curvature: surface.curvature,
    conic: surface.conic,
    thickness: surface.thickness,
    glassName: surface.glassName,
    coat: surface.coat,
    stop: surface.stop,
    semiDiameter: getMechanicalSemiDiameter(surface),
    clearSemiDiameter: surface.clearSemiDiameter,
  };
}

function createAsphericGlassObj(region, firstVertexX, refParam, bParam, options = {}) {
  const obj = {
    type: 'AsphericGlass',
    p1: makePointExpr(region.frontSurface.vertexX - firstVertexX, 0),
    p2: makePointExpr(region.backSurface.vertexX - firstVertexX, 0),
    frontSemiDiameter: region.frontSemiDiameter,
    backSemiDiameter: region.backSemiDiameter,
    frontCurvature: region.frontSurface.curvature,
    backCurvature: region.backSurface.curvature,
    frontConic: region.frontSurface.conic ?? 0,
    backConic: region.backSurface.conic ?? 0,
    frontCoefficients: [...getAsphereCoefficients(region.frontSurface)],
    backCoefficients: [...getAsphereCoefficients(region.backSurface)],
    refIndex: `\`${refParam}\``,
    cauchyB: `\`${bParam}\``,
  };
  if (Number.isFinite(options.rimSemiDiameter)) {
    obj.rimSemiDiameter = options.rimSemiDiameter;
  }
  if (options.blockOuterRim) {
    obj.blockOuterRim = true;
  }
  return obj;
}

export function convertParsedZemaxToModule(parsed) {
  const warnings = [...parsed.warnings];
  const regions = [];

  for (let index = 0; index < parsed.surfaces.length - 1; index++) {
    const frontSurface = parsed.surfaces[index];
    const backSurface = parsed.surfaces[index + 1];
    const glassName = frontSurface.glassName;

    if (!glassName) {
      continue;
    }
    if (!Number.isFinite(frontSurface.thickness)) {
      throw new Error(`Surface ${frontSurface.index} has infinite glass thickness, which is unsupported.`);
    }
    if (frontSurface.thickness < 0) {
      throw new Error(`Surface ${frontSurface.index} has negative thickness, which is unsupported.`);
    }
    if (frontSurface.vertexX == null || backSurface.vertexX == null || !Number.isFinite(backSurface.vertexX)) {
      throw new Error(`Unable to determine geometry for the region after surface ${frontSurface.index}.`);
    }
    if (backSurface.glassName && backSurface.glassName.toUpperCase() === glassName.toUpperCase()) {
      throw new Error(`Consecutive surfaces keeping the same glass "${glassName}" are not supported in v1.`);
    }

    const frontSemiDiameter = getMechanicalSemiDiameter(frontSurface);
    const backSemiDiameter = getMechanicalSemiDiameter(backSurface);
    if (!(frontSemiDiameter > 0) || !(backSemiDiameter > 0)) {
      throw new Error(`Missing semi-diameter metadata around glass "${glassName}" between surfaces ${frontSurface.index} and ${backSurface.index}.`);
    }

    const referenceSemiDiameter = Math.min(frontSemiDiameter, backSemiDiameter);
    const frontReferenceX = surfaceXAtY(frontSurface, referenceSemiDiameter);
    const backReferenceX = surfaceXAtY(backSurface, referenceSemiDiameter);
    if (!(backReferenceX > frontReferenceX)) {
      throw new Error(`The glass region between surfaces ${frontSurface.index} and ${backSurface.index} self-intersects in the supported centered-spherical model.`);
    }

    const glassMatch = lookupGlass(glassName);
    if (!glassMatch) {
      warnings.push(`Glass "${glassName}" is not in the bundled catalog. Using editable fallback refractive data.`);
    }

    regions.push({
      frontSurface,
      backSurface,
      glassName,
      refIndex: glassMatch?.refIndex ?? ZEMAX_DEFAULT_GLASS.refIndex,
      cauchyB: glassMatch?.cauchyB ?? ZEMAX_DEFAULT_GLASS.cauchyB,
      frontSemiDiameter,
      backSemiDiameter,
    });
  }

  if (regions.length === 0) {
    throw new Error('No supported refractive glass regions were found in the Zemax file.');
  }

  const firstVertexX = regions[0].frontSurface.vertexX;
  const lastVertexX = regions[regions.length - 1].backSurface.vertexX;
  const totalLength = lastVertexX - firstVertexX;
  if (!(totalLength > 0)) {
    throw new Error('Unable to build a two-point imported module because the optical part has zero axial length.');
  }

  const params = [];
  const objs = [];
  const glassNames = [];
  let maxSemiDiameter = 0;
  regions.forEach((region, index) => {
    const regionIndex = index + 1;
    const refParam = `n_${regionIndex}`;
    const bParam = `B_${regionIndex}`;
    params.push(`${refParam}=0.5:0.01:2.5:${formatNumber(region.refIndex)}`);
    params.push(`${bParam}=0.0001:0.0001:${formatParamUpperBound(region.cauchyB, 0.02)}:${formatNumber(region.cauchyB)}`);
    glassNames.push(region.glassName);
    maxSemiDiameter = Math.max(maxSemiDiameter, region.frontSemiDiameter, region.backSemiDiameter);

    const useAsphericPrimitive = surfaceRequiresAsphericPrimitive(region.frontSurface) || surfaceRequiresAsphericPrimitive(region.backSurface);
    let path;

    if (useAsphericPrimitive) {
      const rimSemiDiameter = inferBlockedCylindricalRimSemiDiameter(region.frontSurface, region.backSurface);
      if (rimSemiDiameter != null) {
        warnings.push(`Surface semi-diameter mismatch around glass "${region.glassName}" was interpreted as a blocked cylindrical rim at semi-diameter ${formatNumber(rimSemiDiameter)}.`);
      }
      objs.push(createAsphericGlassObj(region, firstVertexX, refParam, bParam, {
        rimSemiDiameter,
        blockOuterRim: rimSemiDiameter != null,
      }));
      return;
    } else {
      const frontVertexLocalX = region.frontSurface.vertexX - firstVertexX;
      const backVertexLocalX = region.backSurface.vertexX - firstVertexX;
      const frontTop = {
        x: surfaceXAtY(region.frontSurface, region.frontSemiDiameter) - firstVertexX,
        y: -region.frontSemiDiameter,
        arc: false,
      };
      const backTop = {
        x: surfaceXAtY(region.backSurface, region.backSemiDiameter) - firstVertexX,
        y: -region.backSemiDiameter,
        arc: false,
      };
      const backBottom = {
        x: surfaceXAtY(region.backSurface, region.backSemiDiameter) - firstVertexX,
        y: region.backSemiDiameter,
        arc: false,
      };
      const frontBottom = {
        x: surfaceXAtY(region.frontSurface, region.frontSemiDiameter) - firstVertexX,
        y: region.frontSemiDiameter,
        arc: false,
      };

      path = [
        { ...makePointExpr(frontTop.x, frontTop.y), arc: false },
        { ...makePointExpr(backTop.x, backTop.y), arc: false },
      ];

      if (Math.abs(region.backSurface.curvature) >= 1e-12) {
        path.push({ ...makePointExpr(backVertexLocalX, 0), arc: true });
      }

      path.push({ ...makePointExpr(backBottom.x, backBottom.y), arc: false });
      path.push({ ...makePointExpr(frontBottom.x, frontBottom.y), arc: false });

      if (Math.abs(region.frontSurface.curvature) >= 1e-12) {
        path.push({ ...makePointExpr(frontVertexLocalX, 0), arc: true });
      }
    }

    objs.push({
      type: 'Glass',
      path,
      refIndex: `\`${refParam}\``,
      cauchyB: `\`${bParam}\``,
    });
  });

  const stopSurfaces = parsed.surfaces.filter((surface) => surface.stop);
  if (stopSurfaces.length > 0) {
    const stopSurface = stopSurfaces[0];
    const stopSemiDiameter = stopSurface.clearSemiDiameter;
    if (stopSurfaces.length === 1 && stopSemiDiameter > 0 && Math.abs(stopSurface.curvature) < 1e-12) {
      const localX = stopSurface.vertexX - firstVertexX;
      const outerSemiDiameter = Math.max(maxSemiDiameter, stopSemiDiameter + 1);
      objs.push({
        type: 'Aperture',
        p1: makePointExpr(localX, -outerSemiDiameter),
        p2: makePointExpr(localX, outerSemiDiameter),
        p3: makePointExpr(localX, -stopSemiDiameter),
        p4: makePointExpr(localX, stopSemiDiameter),
      });
    } else {
      warnings.push('The Zemax stop metadata was preserved in the library entry but not converted into a simulator aperture because it is not unambiguous in the supported 2D model.');
    }
  }

  const moduleDef = {
    numPoints: 2,
    params,
    vars: [
      'axisDX=x_2-x_1',
      'axisDY=y_2-y_1',
      'axisLength=sqrt(axisDX^2+axisDY^2)',
      'axisSafeLength=max(axisLength, 1e-9)',
      'axisUnitX=axisDX/axisSafeLength',
      'axisUnitY=axisDY/axisSafeLength',
      'normalUnitX=-axisUnitY',
      'normalUnitY=axisUnitX',
    ],
    objs,
  };

  return {
    moduleDef,
    warnings,
    metadataSummary: {
      unitCode: parsed.unitCode,
      totalLength,
      regionCount: regions.length,
      glassNames: Array.from(new Set(glassNames)),
      notes: parsed.notes,
      surfaces: parsed.surfaces.map(createSurfaceSummary),
    },
  };
}

export function createZemaxLibraryRecord({
  fileName = '',
  sourceText,
  existingModuleNames = [],
  now = () => new Date().toISOString(),
}) {
  const parsed = parseZemaxText(sourceText);
  const converted = convertParsedZemaxToModule(parsed);
  const displayName = parsed.name || fileName.replace(/\.[^.]+$/, '') || 'Imported Zemax Part';
  const baseModuleName = sanitizeModuleName(displayName, fileName);
  const moduleName = makeUniqueModuleName(baseModuleName, existingModuleNames);
  const timestamp = now();

  return {
    id: createLibraryRecordId(),
    name: displayName,
    moduleName,
    sourceFileName: fileName,
    sourceText,
    moduleDef: converted.moduleDef,
    metadataSummary: converted.metadataSummary,
    diagnostics: {
      warnings: converted.warnings,
      errors: [],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
