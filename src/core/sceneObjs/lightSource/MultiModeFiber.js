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

import BaseSceneObj from '../BaseSceneObj.js';
import LineObjMixin from '../LineObjMixin.js';
import Simulator from '../../Simulator.js';
import geometry from '../../geometry.js';
import i18next from 'i18next';

const MIN_AXIS_LENGTH = 1e-9;

/**
 * Multi-mode fiber source.
 *
 * Tools -> Light source -> Multi-mode fiber
 * @class
 * @extends BaseSceneObj
 * @memberof sceneObjs
 * @property {Point} p1 - The center of the fiber core face.
 * @property {Point} p2 - A point indicating the fiber axis direction.
 * @property {number} brightness - The brightness density of the source.
 * @property {number} wavelength - The wavelength of the source in nm. Only effective when "Simulate Colors" is on.
 * @property {number} coreDiameter - The diameter of the emitting core.
 * @property {number} na - The numerical aperture of the fiber in air.
 * @property {number} pointSources - The number of evenly spaced point emitters across the core.
 */
class MultiModeFiber extends LineObjMixin(BaseSceneObj) {
  static type = 'MultiModeFiber';
  static isOptical = true;
  static serializableDefaults = {
    p1: null,
    p2: null,
    brightness: 0.5,
    wavelength: Simulator.GREEN_WAVELENGTH,
    coreDiameter: 1.5,
    na: 0.22,
    pointSources: 5,
  };

  static getDescription(objData, scene, detailed = false) {
    return i18next.t('main:tools.MultiModeFiber.title');
  }

  static getPropertySchema(objData, scene) {
    return [
      { key: 'p1', type: 'point', label: i18next.t('simulator:sceneObjs.LineObjMixin.sourcePoint') },
      { key: 'p2', type: 'point', label: i18next.t('simulator:sceneObjs.LineObjMixin.directionPoint') },
      { key: 'brightness', type: 'number', label: i18next.t('simulator:sceneObjs.common.brightness') },
      { key: 'wavelength', type: 'number', label: i18next.t('simulator:sceneObjs.common.wavelength') + ' (nm)' },
      { key: 'coreDiameter', type: 'number', label: i18next.t('simulator:sceneObjs.MultiModeFiber.coreDiameter') },
      { key: 'na', type: 'number', label: i18next.t('simulator:sceneObjs.MultiModeFiber.na') },
      { key: 'pointSources', type: 'number', label: i18next.t('simulator:sceneObjs.MultiModeFiber.pointSources') },
    ];
  }

  populateObjBar(objBar) {
    const brightnessInfo = this.scene.colorMode !== 'default'
      ? i18next.t('simulator:sceneObjs.common.brightnessInfo.newColorModes')
      : '<p>' + i18next.t('simulator:sceneObjs.common.brightnessInfo.rayDensity') + '</p><p>' + i18next.t('simulator:sceneObjs.common.brightnessInfo.rayDensitySlider') + '</p>';

    objBar.setTitle(i18next.t('main:tools.MultiModeFiber.title'));
    objBar.createNumber(i18next.t('simulator:sceneObjs.common.brightness'), 0.01 / this.scene.lengthScale, 1 / this.scene.lengthScale, 0.01 / this.scene.lengthScale, this.brightness, function (obj, value) {
      obj.brightness = value;
    }, brightnessInfo);
    if (this.scene.simulateColors) {
      objBar.createNumber(i18next.t('simulator:sceneObjs.common.wavelength') + ' (nm)', Simulator.UV_WAVELENGTH, Simulator.INFRARED_WAVELENGTH, 1, this.wavelength, function (obj, value) {
        obj.wavelength = value;
      });
    }
    objBar.createNumber(i18next.t('simulator:sceneObjs.MultiModeFiber.coreDiameter'), 0.01, 100, 0.01, this.coreDiameter, function (obj, value) {
      obj.coreDiameter = value;
    });
    objBar.createNumber(i18next.t('simulator:sceneObjs.MultiModeFiber.na'), 0, 1, 0.01, this.na, function (obj, value) {
      obj.na = value;
    });
    objBar.createNumber(i18next.t('simulator:sceneObjs.MultiModeFiber.pointSources'), 1, 100, 1, this.pointSources, function (obj, value) {
      obj.pointSources = Math.max(1, Math.round(value));
    });
  }

  onConstructMouseDown(mouse, ctrl, shift) {
    super.onConstructMouseDown(mouse, ctrl, shift);
    if (this.scene.colorMode !== 'default') {
      this.brightness = 0.1;
    }
  }

  draw(canvasRenderer, isAboveLight, isHovered) {
    const ctx = canvasRenderer.ctx;
    const ls = canvasRenderer.lengthScale;
    const axisData = this.getAxisData();

    if (!axisData) {
      if (this.p1) {
        ctx.fillStyle = 'rgb(128,128,128)';
        ctx.fillRect(this.p1.x - 1.5 * ls, this.p1.y - 1.5 * ls, 3 * ls, 3 * ls);
      }
      return;
    }

    const coreSegment = this.getCoreSegment();
    const colorArray = this.scene.simulator.wavelengthToColor(this.wavelength, 1);
    ctx.strokeStyle = isHovered ? this.scene.highlightColorCss : canvasRenderer.rgbaToCssColor(this.scene.simulateColors ? colorArray : this.scene.theme.lightSource.color);
    ctx.lineWidth = this.scene.theme.lightSource.size * 4 / 5 * ls;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(coreSegment.p1.x, coreSegment.p1.y);
    ctx.lineTo(coreSegment.p2.x, coreSegment.p2.y);
    ctx.stroke();

    ctx.strokeStyle = canvasRenderer.rgbaToCssColor(this.scene.theme.beamShield.color);
    ctx.lineWidth = this.scene.theme.beamShield.width * ls;
    ctx.beginPath();
    ctx.moveTo(coreSegment.p1.x, coreSegment.p1.y);
    ctx.lineTo(coreSegment.p2.x, coreSegment.p2.y);
    ctx.stroke();
    ctx.lineWidth = 1 * ls;
    ctx.lineCap = 'butt';

    if (isHovered) {
      ctx.fillStyle = 'rgb(255,0,0)';
      ctx.fillRect(this.p1.x - 1.5 * ls, this.p1.y - 1.5 * ls, 3 * ls, 3 * ls);
      ctx.fillRect(this.p2.x - 1.5 * ls, this.p2.y - 1.5 * ls, 3 * ls, 3 * ls);
    }
  }

  checkMouseOver(mouse) {
    let dragContext = {};
    if (mouse.isOnPoint(this.p1) && geometry.distanceSquared(mouse.pos, this.p1) <= geometry.distanceSquared(mouse.pos, this.p2)) {
      dragContext.part = 1;
      dragContext.targetPoint = geometry.point(this.p1.x, this.p1.y);
      return dragContext;
    }
    if (mouse.isOnPoint(this.p2)) {
      dragContext.part = 2;
      dragContext.targetPoint = geometry.point(this.p2.x, this.p2.y);
      return dragContext;
    }

    const coreSegment = this.getCoreSegment();
    if ((coreSegment && mouse.isOnSegment(coreSegment)) || mouse.isOnSegment(this)) {
      const mousePos = mouse.getPosSnappedToGrid();
      dragContext.part = 0;
      dragContext.mousePos0 = mousePos;
      dragContext.mousePos1 = mousePos;
      dragContext.snapContext = {};
      return dragContext;
    }
    return null;
  }

  getDefaultCenter() {
    return this.p1;
  }

  scale(scale, center) {
    super.scale(scale, center);
    this.coreDiameter *= scale;
    this.brightness /= scale;
    return true;
  }

  onSimulationStart() {
    const axisData = this.getAxisData();
    if (!axisData) {
      return {
        newRays: [],
        brightnessScale: 1,
      };
    }

    const clampedNA = Math.min(Math.max(this.na, 0), 1);
    const halfAngle = Math.asin(clampedNA);
    const pointSources = Math.max(1, Math.round(this.pointSources));

    if ((this.scene.mode === 'images' || this.scene.mode === 'observer') && clampedNA > 0) {
      this.warning = i18next.t('simulator:sceneObjs.Beam.imageDetectionWarning');
    } else {
      this.warning = null;
    }

    let rayDensity = this.scene.rayDensity;
    let rayBrightness = 1;
    let expectBrightness = 0;
    do {
      const stepAngle = Math.PI * 2 / parseInt(rayDensity * 500);
      const angledPairs = Math.floor(halfAngle / stepAngle);
      const numAngledRays = 1 + angledPairs * 2;
      rayBrightness = 1 / numAngledRays;
      expectBrightness = this.brightness * this.coreDiameter / pointSources * rayBrightness;

      if (this.scene.colorMode !== 'default' && expectBrightness > 1) {
        rayDensity += 1 / 500;
      } else {
        break;
      }
    } while (true);

    const stepAngle = Math.PI * 2 / parseInt(rayDensity * 500);
    const offsets = this.getPointSourceOffsets(pointSources);
    const newRays = [];

    offsets.forEach((offset, sourceIndex) => {
      const x = this.p1.x + axisData.normalX * offset;
      const y = this.p1.y + axisData.normalY * offset;

      newRays.push(this.newRay(x, y, axisData.axisAngle, 0, sourceIndex === 0, rayBrightness, pointSources));
      for (let angle = stepAngle; angle < halfAngle; angle += stepAngle) {
        newRays.push(this.newRay(x, y, axisData.axisAngle, angle, false, rayBrightness, pointSources));
        newRays.push(this.newRay(x, y, axisData.axisAngle, -angle, false, rayBrightness, pointSources));
      }
    });

    return {
      newRays,
      brightnessScale: expectBrightness > 0 ? Math.min(expectBrightness, 1) / expectBrightness : 1,
    };
  }

  getAxisData() {
    if (!this.p1 || !this.p2) {
      return null;
    }
    const dx = this.p2.x - this.p1.x;
    const dy = this.p2.y - this.p1.y;
    const axisLength = Math.hypot(dx, dy);
    if (axisLength <= MIN_AXIS_LENGTH) {
      return null;
    }
    return {
      axisLength,
      axisAngle: Math.atan2(dy, dx),
      dirX: dx / axisLength,
      dirY: dy / axisLength,
      normalX: -dy / axisLength,
      normalY: dx / axisLength,
    };
  }

  getCoreSegment() {
    const axisData = this.getAxisData();
    if (!axisData) {
      return null;
    }
    const halfDiameter = this.coreDiameter / 2;
    return geometry.line(
      geometry.point(this.p1.x - axisData.normalX * halfDiameter, this.p1.y - axisData.normalY * halfDiameter),
      geometry.point(this.p1.x + axisData.normalX * halfDiameter, this.p1.y + axisData.normalY * halfDiameter),
    );
  }

  getPointSourceOffsets(pointSources) {
    if (pointSources <= 1) {
      return [0];
    }
    const halfDiameter = this.coreDiameter / 2;
    const step = this.coreDiameter / (pointSources - 1);
    return Array.from({ length: pointSources }, (_, index) => -halfDiameter + index * step);
  }

  newRay(x, y, axisAngle, angle, gap, rayBrightness, pointSources) {
    const ray = geometry.line(
      geometry.point(x, y),
      geometry.point(x + Math.cos(axisAngle + angle), y + Math.sin(axisAngle + angle)),
    );
    const brightness = Math.min(this.brightness * this.coreDiameter / pointSources * rayBrightness, 1);
    ray.brightness_s = brightness * 0.5;
    ray.brightness_p = brightness * 0.5;
    ray.isNew = true;
    if (this.scene.simulateColors) {
      ray.wavelength = this.wavelength;
    }
    ray.gap = gap;
    return ray;
  }
}

export default MultiModeFiber;
