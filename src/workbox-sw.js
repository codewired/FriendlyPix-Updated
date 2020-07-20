/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';
import {skipWaiting, clientsClaim} from 'workbox-core';
import {registerRoute} from 'workbox-routing';
import {CacheFirst} from 'workbox-strategies';
import {precacheAndRoute} from 'workbox-precaching';
import {ExpirationPlugin} from 'workbox-expiration';
import {StaleWhileRevalidate} from 'workbox-strategies';
import {initialize} from 'workbox-google-analytics';


skipWaiting();
clientsClaim();


// Register routes for user uploaded images.
registerRoute(
    /\.(?:png|gif|jpg|jpeg|svg)$/,
    new CacheFirst({
      cacheName: 'images',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
        }),
      ],
    }),
);

// Routes for all dynamic HTML pages.
registerRoute(
    // Cache HTML files
    /[^\.]*/,
    // Use cache but update in the background ASAP
    new StaleWhileRevalidate({
      // Use a custom cache name
      cacheName: 'html-cache',
    }),
);

// Special routes to enable offline for Google Analytics.
initialize();

// self.__precacheManifest = [].concat(self.__precacheManifest || []);
// workbox.precaching.suppressWarnings();
// workbox.precaching.precacheAndRoute(self.__precacheManifest, {});
precacheAndRoute(self.__WB_MANIFEST);
