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

import BaseGlass from '../BaseGlass.js';
import LineObjMixin from '../LineObjMixin.js';
import geometry from '../../geometry.js';
import i18next from 'i18next';

const OUTLINE_SEGMENTS = 96;
const ROOT_SAMPLES = 192;
const ROOT_ITERATIONS = 80;
const NUMERIC_EPSILON = 1e-10;
const MIN_RAY_SEGMENT_LENGTH = 1e-6;
const MIN_RAY_SEGMENT_LENGTH_SQUARED = MIN_RAY_SEGMENT_LENGTH * MIN_RAY_SEGMENT_LENGTH;

function getCoefficientExponent(index) {
  return index * 2;
}

function scaleCoefficient(value, index, scale) {
  return value / Math.pow(scale, getCoefficientExponent(index) - 1);
}

class AsphericGlass extends LineObjMixin(BaseGlass) {
  static type = 'AsphericGlass';
  static isOptical = true;
  static mergesWithGlass = true;
  static serializableDefaults = {
    p1: null,
    p2: null,
    frontSemiDiameter: 10,
    backSemiDiameter: 10,
    rimSemiDiameter: null,
    blockOuterRim: false,
    frontCurvature: 0,
    backCurvature: 0,
    frontConic: 0,
    backConic: 0,
    frontCoefficients: [],
    backCoefficients: [],
    refIndex: 1.5,
    cauchyB: 0.004,
    partialReflect: true,
  };

  static getDescription() {
    return i18next.t('main:meta.parentheses', {
      main: i18next.t('main:tools.categories.glass'),
      sub: 'Aspheric',
    });
  }

  populateObjBar(objBar) {
    objBar.setTitle('Aspheric Glass');
    super.populateObjBar(objBar);
  }

  move(diffX, diffY) {
    this.invalidatePath();
    return super.move(diffX, diffY);
  }

  rotate(angle, center = null) {
    this.invalidatePath();
    return super.rotate(angle, center);
  }

  scale(scale, center = null) {
    this.invalidatePath();
    const didScale = super.scale(scale, center);
    this.frontSemiDiameter *= scale;
    this.backSemiDiameter *= scale;
    this.frontCurvature /= scale;
    this.backCurvature /= scale;
    this.frontCoefficients = this.scaleCoefficients(this.frontCoefficients, scale);
    this.backCoefficients = this.scaleCoefficients(this.backCoefficients, scale);
    return didScale;
  }

  draw(canvasRenderer, isAboveLight, isHovered) {
    const ctx = canvasRenderer.ctx;
    const ls = canvasRenderer.lengthScale;

    if (!this.hasValidAxis()) {
      if (this.p1) {
        ctx.fillStyle = 'rgb(128,128,128)';
        ctx.fillRect(this.p1.x - 1.5 * ls, this.p1.y - 1.5 * ls, 3 * ls, 3 * ls);
      }
      return;
    }

    const outlinePath = this.getOutlinePath();
    if (outlinePath.length < 3) {
      return;
    }

    ctx.beginPath();
    ctx.moveTo(outlinePath[0].x, outlinePath[0].y);
    for (let index = 1; index < outlinePath.length; index++) {
      ctx.lineTo(outlinePath[index].x, outlinePath[index].y);
    }
    this.fillGlass(canvasRenderer, isAboveLight, isHovered);

    if (isHovered) {
      ctx.fillStyle = 'rgb(255,0,0)';
      ctx.fillRect(this.p1.x - 1.5 * ls, this.p1.y - 1.5 * ls, 3 * ls, 3 * ls);
      ctx.fillRect(this.p2.x - 1.5 * ls, this.p2.y - 1.5 * ls, 3 * ls, 3 * ls);
    }
  }

  checkMouseOver(mouse) {
    const dragContext = super.checkMouseOver(mouse);
    if (dragContext) {
      return dragContext;
    }

    const outlinePath = this.getOutlinePath();
    for (let index = 0; index < outlinePath.length; index++) {
      const nextIndex = (index + 1) % outlinePath.length;
      if (mouse.isOnSegment(geometry.line(outlinePath[index], outlinePath[nextIndex]))) {
        const mousePos = mouse.getPosSnappedToGrid();
        return {
          part: 0,
          mousePos0: mousePos,
          mousePos1: mousePos,
          snapContext: {},
        };
      }
    }
    return null;
  }

  onDrag(mouse, dragContext, ctrl, shift) {
    this.invalidatePath();
    super.onDrag(mouse, dragContext, ctrl, shift);
  }

  checkRayIntersects(ray) {
    return this.getIncidentData(ray).s_point;
  }

  onRayIncident(ray, rayIndex, incidentPoint, surfaceMergingObjs) {
    const incidentData = this.getIncidentData(ray);
    const incidentType = incidentData.incidentType;

    if (incidentData.boundaryType === 'rim' && this.blockOuterRim) {
      return {
        isAbsorbed: true,
      };
    }

    if (incidentType === 1) {
      return this.refract(ray, rayIndex, incidentData.s_point, incidentData.normal, this.getRefIndexAt(incidentPoint, ray), surfaceMergingObjs, ray.bodyMergingObj);
    }
    if (incidentType === -1) {
      return this.refract(ray, rayIndex, incidentData.s_point, incidentData.normal, 1 / this.getRefIndexAt(incidentPoint, ray), surfaceMergingObjs, ray.bodyMergingObj);
    }
    if (incidentType === 0) {
      return this.refract(ray, rayIndex, incidentData.s_point, incidentData.normal, 1, surfaceMergingObjs, ray.bodyMergingObj);
    }

    return {
      isAbsorbed: true,
      isUndefinedBehavior: true,
    };
  }

  getIncidentType(ray) {
    return this.getIncidentData(ray).incidentType;
  }

  getIncidentData(ray) {
    if (!this.hasValidAxis()) {
      return {
        s_point: null,
        normal: { x: NaN, y: NaN },
        incidentType: 0,
        boundaryType: null,
      };
    }

    const intersections = this.getBoundaryIntersections(ray);
    if (intersections.length === 0) {
      return {
        s_point: null,
        normal: { x: NaN, y: NaN },
        incidentType: 0,
        boundaryType: null,
      };
    }

    intersections.sort((a, b) => a.t - b.t);
    const first = intersections[0];
    const ambiguityDistance = MIN_RAY_SEGMENT_LENGTH_SQUARED * this.scene.lengthScale * this.scene.lengthScale;

    if (intersections.length > 1 && geometry.distanceSquared(first.point, intersections[1].point) < ambiguityDistance) {
      return {
        s_point: first.point,
        normal: first.normal,
        incidentType: NaN,
        boundaryType: first.boundaryType,
      };
    }

    return {
      s_point: first.point,
      normal: first.normal,
      incidentType: first.incidentType,
      boundaryType: first.boundaryType,
    };
  }

  invalidatePath() {
    delete this.outlinePath;
    delete this.boundaryGeometry;
  }

  hasValidAxis() {
    return this.p1 && this.p2 && geometry.distance(this.p1, this.p2) > NUMERIC_EPSILON;
  }

  scaleCoefficients(coefficients, scale) {
    return (coefficients || []).map((coefficient, index) => {
      if (!Number.isFinite(coefficient) || index === 0) {
        return coefficient;
      }
      return scaleCoefficient(coefficient, index, scale);
    });
  }

  getLocalFrame() {
    const axisLength = geometry.distance(this.p1, this.p2);
    const axisX = (this.p2.x - this.p1.x) / axisLength;
    const axisY = (this.p2.y - this.p1.y) / axisLength;
    const normalX = -axisY;
    const normalY = axisX;
    return {
      axisLength,
      axisX,
      axisY,
      normalX,
      normalY,
    };
  }

  transformToLocal(point) {
    const frame = this.getLocalFrame();
    const dx = point.x - this.p1.x;
    const dy = point.y - this.p1.y;
    return {
      x: dx * frame.axisX + dy * frame.axisY,
      y: dx * frame.normalX + dy * frame.normalY,
    };
  }

  transformToGlobal(point) {
    const frame = this.getLocalFrame();
    return geometry.point(
      this.p1.x + point.x * frame.axisX + point.y * frame.normalX,
      this.p1.y + point.x * frame.axisY + point.y * frame.normalY,
    );
  }

  transformVectorToGlobal(vector) {
    const frame = this.getLocalFrame();
    return geometry.point(
      vector.x * frame.axisX + vector.y * frame.normalX,
      vector.x * frame.axisY + vector.y * frame.normalY,
    );
  }

  getSurfaceSpec(which) {
    return which === 'front'
      ? {
          vertexX: 0,
          semiDiameter: this.frontSemiDiameter,
          curvature: this.frontCurvature,
          conic: this.frontConic,
          coefficients: this.frontCoefficients,
        }
      : {
          vertexX: this.getLocalFrame().axisLength,
          semiDiameter: this.backSemiDiameter,
          curvature: this.backCurvature,
          conic: this.backConic,
          coefficients: this.backCoefficients,
        };
  }

  surfaceSag(surface, y) {
    const absY = Math.abs(y);
    const curvature = surface.curvature || 0;
    const conic = surface.conic || 0;
    let sag = 0;

    if (Math.abs(curvature) >= NUMERIC_EPSILON) {
      const radicand = 1 - (1 + conic) * curvature * curvature * absY * absY;
      if (radicand < -1e-9) {
        throw new Error('Asphere sag is undefined outside the supported clear aperture.');
      }
      sag = curvature * absY * absY / (1 + Math.sqrt(Math.max(0, radicand)));
    }

    (surface.coefficients || []).forEach((coefficient, index) => {
      if (index === 0 || !Number.isFinite(coefficient) || Math.abs(coefficient) <= 1e-18) {
        return;
      }
      sag += coefficient * Math.pow(absY, getCoefficientExponent(index));
    });

    return sag;
  }

  surfaceSlope(surface, y) {
    const absY = Math.abs(y);
    if (absY <= NUMERIC_EPSILON) {
      return 0;
    }

    const curvature = surface.curvature || 0;
    const conic = surface.conic || 0;
    let slope = 0;

    if (Math.abs(curvature) >= NUMERIC_EPSILON) {
      const radicand = Math.max(0, 1 - (1 + conic) * curvature * curvature * absY * absY);
      slope += curvature * absY / Math.sqrt(Math.max(NUMERIC_EPSILON, radicand));
    }

    (surface.coefficients || []).forEach((coefficient, index) => {
      if (index === 0 || !Number.isFinite(coefficient) || Math.abs(coefficient) <= 1e-18) {
        return;
      }
      const exponent = getCoefficientExponent(index);
      slope += coefficient * exponent * Math.pow(absY, exponent - 1);
    });

    return Math.sign(y) * slope;
  }

  surfaceX(surface, y) {
    return surface.vertexX + this.surfaceSag(surface, y);
  }

  getEdgePoints() {
    const front = this.getSurfaceSpec('front');
    const back = this.getSurfaceSpec('back');
    return {
      frontTop: { x: this.surfaceX(front, -front.semiDiameter), y: -front.semiDiameter },
      backTop: { x: this.surfaceX(back, -back.semiDiameter), y: -back.semiDiameter },
      backBottom: { x: this.surfaceX(back, back.semiDiameter), y: back.semiDiameter },
      frontBottom: { x: this.surfaceX(front, front.semiDiameter), y: front.semiDiameter },
    };
  }

  getRimSemiDiameter() {
    if (!Number.isFinite(this.rimSemiDiameter)) {
      return null;
    }
    const minRequired = Math.max(this.frontSemiDiameter, this.backSemiDiameter);
    return this.rimSemiDiameter >= minRequired - NUMERIC_EPSILON ? this.rimSemiDiameter : null;
  }

  getBoundaryGeometry() {
    if (this.boundaryGeometry) {
      return this.boundaryGeometry;
    }

    const front = this.getSurfaceSpec('front');
    const back = this.getSurfaceSpec('back');
    const frontProfile = this.sampleSurface(front, true);
    const backProfile = this.sampleSurface(back, true);
    const rimSemiDiameter = this.getRimSemiDiameter();
    const useBlockedRim = rimSemiDiameter != null
      && (rimSemiDiameter > front.semiDiameter + NUMERIC_EPSILON || rimSemiDiameter > back.semiDiameter + NUMERIC_EPSILON);
    const frontHasShoulder = useBlockedRim && front.semiDiameter < rimSemiDiameter - NUMERIC_EPSILON;
    const backHasShoulder = useBlockedRim && back.semiDiameter < rimSemiDiameter - NUMERIC_EPSILON;

    const frontTopOpt = frontProfile[0];
    const frontBottomOpt = frontProfile[frontProfile.length - 1];
    const backTopOpt = backProfile[0];
    const backBottomOpt = backProfile[backProfile.length - 1];

    if (!useBlockedRim) {
      const outlinePoints = [
        frontTopOpt,
        backTopOpt,
        ...backProfile.slice(1),
        frontBottomOpt,
        ...frontProfile.slice(1, -1).reverse(),
      ];
      const edgeSegments = [
        {
          p1: frontTopOpt,
          p2: backTopOpt,
          outwardNormalLocal: { x: 0, y: -1 },
          boundaryType: 'edge',
        },
        {
          p1: backBottomOpt,
          p2: frontBottomOpt,
          outwardNormalLocal: { x: 0, y: 1 },
          boundaryType: 'edge',
        },
      ];
      this.boundaryGeometry = { outlinePoints, edgeSegments };
      return this.boundaryGeometry;
    }

    const frontTopOuter = frontHasShoulder ? { x: frontTopOpt.x, y: -rimSemiDiameter } : frontTopOpt;
    const frontBottomOuter = frontHasShoulder ? { x: frontBottomOpt.x, y: rimSemiDiameter } : frontBottomOpt;
    const backTopOuter = backHasShoulder ? { x: backTopOpt.x, y: -rimSemiDiameter } : backTopOpt;
    const backBottomOuter = backHasShoulder ? { x: backBottomOpt.x, y: rimSemiDiameter } : backBottomOpt;

    const outlinePoints = [
      frontTopOuter,
      backTopOuter,
      ...(backHasShoulder ? [backTopOpt] : []),
      ...backProfile.slice(1),
      ...(backHasShoulder ? [backBottomOuter] : []),
      frontBottomOuter,
      ...(frontHasShoulder ? [frontBottomOpt] : []),
      ...frontProfile.slice(0, -1).reverse(),
    ];

    const rimBoundaryType = this.blockOuterRim ? 'rim' : 'edge';
    const edgeSegments = [
      {
        p1: frontTopOuter,
        p2: backTopOuter,
        outwardNormalLocal: { x: 0, y: -1 },
        boundaryType: rimBoundaryType,
      },
      {
        p1: backBottomOuter,
        p2: frontBottomOuter,
        outwardNormalLocal: { x: 0, y: 1 },
        boundaryType: rimBoundaryType,
      },
    ];

    if (frontHasShoulder) {
      edgeSegments.push({
        p1: frontTopOpt,
        p2: frontTopOuter,
        outwardNormalLocal: { x: -1, y: 0 },
        boundaryType: rimBoundaryType,
      });
      edgeSegments.push({
        p1: frontBottomOpt,
        p2: frontBottomOuter,
        outwardNormalLocal: { x: -1, y: 0 },
        boundaryType: rimBoundaryType,
      });
    }

    if (backHasShoulder) {
      edgeSegments.push({
        p1: backTopOuter,
        p2: backTopOpt,
        outwardNormalLocal: { x: 1, y: 0 },
        boundaryType: rimBoundaryType,
      });
      edgeSegments.push({
        p1: backBottomOpt,
        p2: backBottomOuter,
        outwardNormalLocal: { x: 1, y: 0 },
        boundaryType: rimBoundaryType,
      });
    }

    this.boundaryGeometry = { outlinePoints, edgeSegments };
    return this.boundaryGeometry;
  }

  getOutlinePath() {
    if (this.outlinePath) {
      return this.outlinePath;
    }

    this.outlinePath = this.getBoundaryGeometry().outlinePoints.map((point) => this.transformToGlobal(point));
    return this.outlinePath;
  }

  sampleSurface(surface, topToBottom) {
    const points = [];
    const segmentCount = Math.max(OUTLINE_SEGMENTS, Math.ceil(surface.semiDiameter));

    for (let index = 0; index <= segmentCount; index++) {
      const ratio = index / segmentCount;
      const y = topToBottom
        ? -surface.semiDiameter + ratio * 2 * surface.semiDiameter
        : surface.semiDiameter - ratio * 2 * surface.semiDiameter;
      points.push({
        x: this.surfaceX(surface, y),
        y,
      });
    }

    return points;
  }

  getRayLocalData(ray) {
    const p1 = this.transformToLocal(ray.p1);
    const p2 = this.transformToLocal(ray.p2);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= NUMERIC_EPSILON) {
      return null;
    }
    return {
      start: p1,
      dirX: dx / distance,
      dirY: dy / distance,
    };
  }

  getBoundaryIntersections(ray) {
    const rayLocal = this.getRayLocalData(ray);
    if (!rayLocal) {
      return [];
    }

    const candidates = [
      ...this.findSurfaceIntersections(ray, rayLocal, 'front'),
      ...this.findSurfaceIntersections(ray, rayLocal, 'back'),
      ...this.findEdgeIntersections(ray, rayLocal),
    ];

    const deduped = [];
    const threshold = MIN_RAY_SEGMENT_LENGTH_SQUARED * this.scene.lengthScale * this.scene.lengthScale;
    for (const candidate of candidates) {
      if (!deduped.some((existing) => geometry.distanceSquared(existing.point, candidate.point) < threshold)) {
        deduped.push(candidate);
      }
    }
    return deduped;
  }

  findSurfaceIntersections(ray, rayLocal, which) {
    const surface = this.getSurfaceSpec(which);
    const minT = MIN_RAY_SEGMENT_LENGTH * this.scene.lengthScale;
    const intersections = [];

    const pushIntersection = (y) => {
      const x = this.surfaceX(surface, y);
      const t = Math.abs(rayLocal.dirY) <= NUMERIC_EPSILON
        ? (x - rayLocal.start.x) / rayLocal.dirX
        : (y - rayLocal.start.y) / rayLocal.dirY;

      if (!(t > minT) || !Number.isFinite(t)) {
        return;
      }

      const pointLocal = { x, y };
      const point = this.transformToGlobal(pointLocal);
      const slope = this.surfaceSlope(surface, y);
      const outwardNormalLocal = which === 'front'
        ? { x: -1, y: slope }
        : { x: 1, y: -slope };
      const rayDirGlobal = this.normalizeVector(geometry.point(ray.p2.x - ray.p1.x, ray.p2.y - ray.p1.y));
      const { normal, incidentType } = this.orientNormalForRay(
        this.transformVectorToGlobal(outwardNormalLocal),
        rayDirGlobal,
      );

      intersections.push({
        t,
        point,
        normal,
        incidentType,
      });
    };

    if (Math.abs(rayLocal.dirY) <= NUMERIC_EPSILON) {
      const y = rayLocal.start.y;
      if (Math.abs(y) <= surface.semiDiameter + 1e-9 && Math.abs(rayLocal.dirX) > NUMERIC_EPSILON) {
        pushIntersection(y);
      }
      return intersections;
    }

    const lineXAtY = (y) => rayLocal.start.x + rayLocal.dirX * (y - rayLocal.start.y) / rayLocal.dirY;
    const equationAtY = (y) => lineXAtY(y) - this.surfaceX(surface, y);
    let previousY = -surface.semiDiameter;
    let previousValue = equationAtY(previousY);

    if (Math.abs(previousValue) < 1e-12) {
      pushIntersection(previousY);
    }

    for (let index = 1; index <= ROOT_SAMPLES; index++) {
      const currentY = -surface.semiDiameter + (2 * surface.semiDiameter * index) / ROOT_SAMPLES;
      const currentValue = equationAtY(currentY);

      if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue)) {
        previousY = currentY;
        previousValue = currentValue;
        continue;
      }

      if (Math.abs(currentValue) < 1e-12) {
        pushIntersection(currentY);
      } else if (previousValue * currentValue < 0) {
        pushIntersection(this.bisectRoot(previousY, currentY, equationAtY));
      }

      previousY = currentY;
      previousValue = currentValue;
    }

    return intersections;
  }

  findEdgeIntersections(ray, rayLocal) {
    const edgeSegments = this.getBoundaryGeometry().edgeSegments;
    const localRayLine = geometry.line(
      geometry.point(rayLocal.start.x, rayLocal.start.y),
      geometry.point(rayLocal.start.x + rayLocal.dirX, rayLocal.start.y + rayLocal.dirY),
    );
    const rayDirGlobal = this.normalizeVector(geometry.point(ray.p2.x - ray.p1.x, ray.p2.y - ray.p1.y));
    const minDistanceSq = MIN_RAY_SEGMENT_LENGTH_SQUARED * this.scene.lengthScale * this.scene.lengthScale;

    return edgeSegments.flatMap((edge) => {
      const segmentLine = geometry.line(edge.p1, edge.p2);
      const intersectionLocal = geometry.linesIntersection(localRayLine, segmentLine);
      if (!Number.isFinite(intersectionLocal.x) || !Number.isFinite(intersectionLocal.y)) {
        return [];
      }
      if (!geometry.intersectionIsOnSegment(intersectionLocal, segmentLine)) {
        return [];
      }
      if (!geometry.intersectionIsOnRay(intersectionLocal, localRayLine)) {
        return [];
      }

      const point = this.transformToGlobal(intersectionLocal);
      if (geometry.distanceSquared(ray.p1, point) <= minDistanceSq) {
        return [];
      }

      const { normal, incidentType } = this.orientNormalForRay(
        this.transformVectorToGlobal(edge.outwardNormalLocal),
        rayDirGlobal,
      );

      return [{
        t: geometry.distance(ray.p1, point),
        point,
        normal,
        incidentType,
        boundaryType: edge.boundaryType,
      }];
    });
  }

  bisectRoot(left, right, fn) {
    let a = left;
    let b = right;
    let fa = fn(a);
    let fb = fn(b);

    for (let iteration = 0; iteration < ROOT_ITERATIONS; iteration++) {
      const midpoint = 0.5 * (a + b);
      const fm = fn(midpoint);
      if (Math.abs(fm) < 1e-12 || Math.abs(b - a) < 1e-10) {
        return midpoint;
      }
      if (fa * fm <= 0) {
        b = midpoint;
        fb = fm;
      } else {
        a = midpoint;
        fa = fm;
      }
      if (Math.abs(fb) < 1e-12) {
        return b;
      }
    }

    return 0.5 * (a + b);
  }

  normalizeVector(vector) {
    const length = Math.hypot(vector.x, vector.y);
    if (length <= NUMERIC_EPSILON) {
      return geometry.point(0, 0);
    }
    return geometry.point(vector.x / length, vector.y / length);
  }

  orientNormalForRay(outwardNormal, rayDirGlobal) {
    const outward = this.normalizeVector(outwardNormal);
    const dot = geometry.dot(rayDirGlobal, outward);
    if (Math.abs(dot) <= NUMERIC_EPSILON) {
      return {
        normal: outward,
        incidentType: NaN,
      };
    }
    return {
      normal: dot > 0 ? geometry.point(-outward.x, -outward.y) : outward,
      incidentType: dot > 0 ? 1 : -1,
    };
  }
}

export default AsphericGlass;
