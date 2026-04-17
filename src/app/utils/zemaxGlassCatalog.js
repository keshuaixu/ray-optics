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
 * Approximate glass lookup for imported Zemax parts.
 *
 * The simulator uses a simple refractive-index/Cauchy-B model, so these values
 * are intentionally pragmatic defaults rather than a full catalog replacement.
 */
export const ZEMAX_GLASS_CATALOG = Object.freeze({
  'BK7': Object.freeze({ refIndex: 1.5168, cauchyB: 0.0042 }),
  'F2': Object.freeze({ refIndex: 1.62, cauchyB: 0.0074 }),
  'N-BK7': Object.freeze({ refIndex: 1.5168, cauchyB: 0.0042 }),
  'N-F2': Object.freeze({ refIndex: 1.62, cauchyB: 0.0074 }),
  'N-FK5': Object.freeze({ refIndex: 1.4875, cauchyB: 0.0043 }),
  'N-LAK14': Object.freeze({ refIndex: 1.6968, cauchyB: 0.0068 }),
  'N-LASF9': Object.freeze({ refIndex: 1.8503, cauchyB: 0.0124 }),
  'N-LASF31': Object.freeze({ refIndex: 1.883, cauchyB: 0.0142 }),
  'N-SF11': Object.freeze({ refIndex: 1.7847, cauchyB: 0.013 }),
  'N-SF66': Object.freeze({ refIndex: 1.9229, cauchyB: 0.0179 }),
  'S-LAH64': Object.freeze({ refIndex: 1.788, cauchyB: 0.0087 }),
  'SF11': Object.freeze({ refIndex: 1.7847, cauchyB: 0.013 }),
  'SF66': Object.freeze({ refIndex: 1.9229, cauchyB: 0.0179 }),
  'S-TIH6': Object.freeze({ refIndex: 1.8052, cauchyB: 0.0109 }),
});
