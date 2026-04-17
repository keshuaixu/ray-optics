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

import i18next from 'i18next';
import Simulator from '../../Simulator.js';
import MultiModeFiber from './MultiModeFiber.js';

class MultiModeFiberRandom extends MultiModeFiber {
  static type = 'MultiModeFiberRandom';

  static getDescription(objData, scene, detailed = false) {
    return i18next.t('main:tools.MultiModeFiberRandom.title');
  }

  populateObjBar(objBar) {
    const brightnessInfo = this.scene.colorMode !== 'default'
      ? i18next.t('simulator:sceneObjs.common.brightnessInfo.newColorModes')
      : '<p>' + i18next.t('simulator:sceneObjs.common.brightnessInfo.rayDensity') + '</p><p>' + i18next.t('simulator:sceneObjs.common.brightnessInfo.rayDensitySlider') + '</p>';

    objBar.setTitle(i18next.t('main:tools.MultiModeFiberRandom.title'));
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

    this.initRandom();
    const offsets = this.getPointSourceOffsets(pointSources);
    const brightness = this.brightness * this.coreDiameter / pointSources;
    const newRays = offsets.map((offset, sourceIndex) => {
      const x = this.p1.x + axisData.normalX * offset;
      const y = this.p1.y + axisData.normalY * offset;
      const randomAngle = (this.getRandom(sourceIndex) * 2 - 1) * halfAngle;
      return this.newRay(x, y, axisData.axisAngle, randomAngle, sourceIndex === 0, 1, pointSources);
    });

    return {
      newRays,
      brightnessScale: brightness > 0 ? Math.min(brightness, 1) / brightness : 1,
    };
  }

  initRandom() {
    if (this.randomNumbers == undefined) {
      this.clearRandom();
    }
  }

  clearRandom() {
    this.randomNumbers = [];
  }

  getRandom(index) {
    for (let i = this.randomNumbers.length; i <= index; i++) {
      this.randomNumbers.push(this.scene.rng());
    }
    return this.randomNumbers[index];
  }
}

export default MultiModeFiberRandom;
