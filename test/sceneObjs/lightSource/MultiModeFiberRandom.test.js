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

import MultiModeFiberRandom from '../../../src/core/sceneObjs/lightSource/MultiModeFiberRandom';
import Scene from '../../../src/core/Scene';
import { testLineObj } from '../helpers/lineObjTests';
import { MockUser } from '../helpers/test-utils';

describe('MultiModeFiberRandom', () => {
  let scene;
  let obj;
  let user;

  beforeEach(() => {
    scene = new Scene();
    obj = new MultiModeFiberRandom(scene);
    user = new MockUser(obj);
  });

  testLineObj(() => ({ obj, user }));

  it('rotates 90 degrees around default center (p1)', () => {
    user.click(100, 100);
    user.click(200, 300);

    user.rotate(Math.PI / 2);
    const result = obj.serialize();
    expect(result.p1.x).toBeCloseTo(100, 5);
    expect(result.p1.y).toBeCloseTo(100, 5);
    expect(result.p2.x).toBeCloseTo(-100, 5);
    expect(result.p2.y).toBeCloseTo(200, 5);
    expect(result.type).toBe('MultiModeFiberRandom');
  });

  it('scales to 50% around default center (p1)', () => {
    user.click(100, 100);
    user.click(200, 300);

    user.scale(0.5);
    const result = obj.serialize();
    expect(result.p1.x).toBeCloseTo(100, 5);
    expect(result.p1.y).toBeCloseTo(100, 5);
    expect(result.p2.x).toBeCloseTo(150, 5);
    expect(result.p2.y).toBeCloseTo(200, 5);
    expect(result.coreDiameter).toBeCloseTo(0.75, 8);
    expect(result.brightness).toBeCloseTo(1, 8);
    expect(result.type).toBe('MultiModeFiberRandom');
  });

  it('sets properties for simulateColors', () => {
    user.click(100, 100);
    user.click(200, 300);
    user.setScene('simulateColors', true);

    user.set('{{simulator:sceneObjs.common.brightness}}', 0.3);
    user.set('{{simulator:sceneObjs.common.wavelength}}', 500);
    user.set('{{simulator:sceneObjs.MultiModeFiber.coreDiameter}}', 2.5);
    user.set('{{simulator:sceneObjs.MultiModeFiber.na}}', 0.35);
    user.set('{{simulator:sceneObjs.MultiModeFiber.pointSources}}', 7);

    expect(obj.serialize()).toEqual({
      type: 'MultiModeFiberRandom',
      p1: { x: 100, y: 100 },
      p2: { x: 200, y: 300 },
      brightness: 0.3,
      wavelength: 500,
      coreDiameter: 2.5,
      na: 0.35,
      pointSources: 7,
    });
  });

  it('emits one cached pseudorandom ray per evenly spaced point within the NA cone', () => {
    obj.p1 = { x: 0, y: 0 };
    obj.p2 = { x: 10, y: 0 };
    obj.coreDiameter = 4;
    obj.na = 0.22;
    obj.pointSources = 3;

    const first = obj.onSimulationStart();
    const second = obj.onSimulationStart();
    const firstSourceYs = first.newRays.map((ray) => Number(ray.p1.y.toFixed(6)));
    const secondSourceYs = second.newRays.map((ray) => Number(ray.p1.y.toFixed(6)));
    const firstAngles = first.newRays.map((ray) => Math.atan2(ray.p2.y - ray.p1.y, ray.p2.x - ray.p1.x));
    const secondAngles = second.newRays.map((ray) => Math.atan2(ray.p2.y - ray.p1.y, ray.p2.x - ray.p1.x));
    const halfAngle = Math.asin(0.22);

    expect(first.newRays).toHaveLength(3);
    expect(firstSourceYs).toEqual([-2, 0, 2]);
    expect(secondSourceYs).toEqual(firstSourceYs);
    expect(secondAngles).toEqual(firstAngles);
    expect(first.newRays.every((ray) => ray.p2.x > ray.p1.x)).toBe(true);
    expect(Math.min(...firstAngles)).toBeGreaterThanOrEqual(-halfAngle - 1e-9);
    expect(Math.max(...firstAngles)).toBeLessThanOrEqual(halfAngle + 1e-9);
    expect(first.brightnessScale).toBeGreaterThan(0);
  });
});
