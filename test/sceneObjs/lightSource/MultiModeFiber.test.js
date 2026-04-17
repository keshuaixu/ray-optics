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

import MultiModeFiber from '../../../src/core/sceneObjs/lightSource/MultiModeFiber';
import Scene from '../../../src/core/Scene';
import { testLineObj } from '../helpers/lineObjTests';
import { MockUser } from '../helpers/test-utils';

describe('MultiModeFiber', () => {
  let scene;
  let obj;
  let user;

  beforeEach(() => {
    scene = new Scene();
    obj = new MultiModeFiber(scene);
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
    expect(result.type).toBe('MultiModeFiber');
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
    expect(result.type).toBe('MultiModeFiber');
  });

  it('sets properties for non-simulateColors', () => {
    user.click(100, 100);
    user.click(200, 300);

    user.set('{{simulator:sceneObjs.common.brightness}}', 0.3);
    user.set('{{simulator:sceneObjs.MultiModeFiber.coreDiameter}}', 2.5);
    user.set('{{simulator:sceneObjs.MultiModeFiber.na}}', 0.35);
    user.set('{{simulator:sceneObjs.MultiModeFiber.pointSources}}', 7);
    expect(user.get('{{simulator:sceneObjs.common.wavelength}}')).toBeNull();
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
      type: 'MultiModeFiber',
      p1: { x: 100, y: 100 },
      p2: { x: 200, y: 300 },
      brightness: 0.3,
      wavelength: 500,
      coreDiameter: 2.5,
      na: 0.35,
      pointSources: 7,
    });
  });

  it('emits from evenly spaced source points across the core and stays within the NA cone', () => {
    obj.p1 = { x: 0, y: 0 };
    obj.p2 = { x: 10, y: 0 };
    obj.coreDiameter = 4;
    obj.na = 0.22;
    obj.pointSources = 3;

    const result = obj.onSimulationStart();
    const sourceYs = [...new Set(result.newRays.map((ray) => Number(ray.p1.y.toFixed(6))))].sort((a, b) => a - b);
    const rayAngles = result.newRays.map((ray) => Math.atan2(ray.p2.y - ray.p1.y, ray.p2.x - ray.p1.x));
    const halfAngle = Math.asin(0.22);

    expect(sourceYs).toEqual([-2, 0, 2]);
    expect(result.newRays.every((ray) => ray.p2.x > ray.p1.x)).toBe(true);
    expect(Math.min(...rayAngles)).toBeGreaterThanOrEqual(-halfAngle - 1e-9);
    expect(Math.max(...rayAngles)).toBeLessThanOrEqual(halfAngle + 1e-9);
    expect(result.newRays.some((ray) => Math.abs(ray.p2.y - ray.p1.y) < 1e-9)).toBe(true);
    expect(result.brightnessScale).toBeGreaterThan(0);
  });
});
