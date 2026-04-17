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

/**
 * Glass lookup for imported Zemax parts.
 *
 * The simulator uses a simple refractive-index/Cauchy-B model. `refIndex`
 * values match the published n_d values, and `cauchyB` values are pragmatic
 * two-term fits derived from the published n_F - n_C dispersion data.
 */
export const ZEMAX_GLASS_CATALOG = Object.freeze({
  'BK7': Object.freeze({ refIndex: 1.5168, cauchyB: 0.0042 }),
  'F2': Object.freeze({ refIndex: 1.62004, cauchyB: 0.0089 }),
  'N-BK7': Object.freeze({ refIndex: 1.5168, cauchyB: 0.0042 }),
  'N-F2': Object.freeze({ refIndex: 1.62005, cauchyB: 0.0089 }),
  'N-FK5': Object.freeze({ refIndex: 1.48749, cauchyB: 0.0036 }),
  'N-LAK14': Object.freeze({ refIndex: 1.6968, cauchyB: 0.0066 }),
  'N-LAK22': Object.freeze({ refIndex: 1.65113, cauchyB: 0.0061 }),
  'N-LASF9': Object.freeze({ refIndex: 1.85025, cauchyB: 0.0138 }),
  'N-LASF31': Object.freeze({ refIndex: 1.883, cauchyB: 0.0113 }),
  'N-LASF31A': Object.freeze({ refIndex: 1.883, cauchyB: 0.0113 }),
  'N-SF6': Object.freeze({ refIndex: 1.80518, cauchyB: 0.0166 }),
  'N-SF11': Object.freeze({ refIndex: 1.78472, cauchyB: 0.016 }),
  'N-SF66': Object.freeze({ refIndex: 1.92286, cauchyB: 0.0231 }),
  'S-LAH64': Object.freeze({ refIndex: 1.788, cauchyB: 0.0087 }),
  'SF11': Object.freeze({ refIndex: 1.78472, cauchyB: 0.0159 }),
  'SF66': Object.freeze({ refIndex: 1.92286, cauchyB: 0.0231 }),
  'S-TIH6': Object.freeze({ refIndex: 1.80518, cauchyB: 0.0166 }),
});
