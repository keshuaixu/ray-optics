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

import { ZEMAX_GLASS_CATALOG } from '../../src/app/utils/zemaxGlassCatalog.js';

describe('zemaxGlassCatalog', () => {
  it('keeps the verified bundled glass defaults', () => {
    expect(ZEMAX_GLASS_CATALOG).toEqual({
      'BK7': { refIndex: 1.5168, cauchyB: 0.0042 },
      'F2': { refIndex: 1.62004, cauchyB: 0.0089 },
      'N-BK7': { refIndex: 1.5168, cauchyB: 0.0042 },
      'N-F2': { refIndex: 1.62005, cauchyB: 0.0089 },
      'N-FK5': { refIndex: 1.48749, cauchyB: 0.0036 },
      'N-LAK14': { refIndex: 1.6968, cauchyB: 0.0066 },
      'N-LAK22': { refIndex: 1.65113, cauchyB: 0.0061 },
      'N-LASF9': { refIndex: 1.85025, cauchyB: 0.0138 },
      'N-LASF31': { refIndex: 1.883, cauchyB: 0.0113 },
      'N-LASF31A': { refIndex: 1.883, cauchyB: 0.0113 },
      'N-SF6': { refIndex: 1.80518, cauchyB: 0.0166 },
      'N-SF11': { refIndex: 1.78472, cauchyB: 0.016 },
      'N-SF66': { refIndex: 1.92286, cauchyB: 0.0231 },
      'S-LAH64': { refIndex: 1.788, cauchyB: 0.0087 },
      'SF11': { refIndex: 1.78472, cauchyB: 0.0159 },
      'SF66': { refIndex: 1.92286, cauchyB: 0.0231 },
      'S-TIH6': { refIndex: 1.80518, cauchyB: 0.0166 },
    });
  });
});
