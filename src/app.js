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

import $ from 'jquery';
import firebase from 'firebase/app';
import firebaseConfig from './firebase-config.json';
import Auth from './Auth';
import IpFilter from './IpFilter';
import Router from './Router';
import 'material-design-lite';
import {Utils} from './Utils';

// Styling
import 'material-design-icons/iconfont/material-icons.css';
import 'typeface-amaranth/index.css';
import 'material-design-lite/material.min.css';
import 'firebaseui/dist/firebaseui.css';
import './app.css';

/**
 * This loads the critical path of the app to speed up first draw.
 * The following components are initially loaded:
 *  - IP Filter for EU countries features.
 *  - CSS styling.
 *  - Auth to know if the user is signed-in.
 *  - The App's router which can display the Splash page.
 *  - Enable Offline.
 * The rest of the app is loaded asynchroneously and passed to the router.
 * Google Analytics is asynchroneously loaded.
 */

// Configure Firebase.
firebase.initializeApp(firebaseConfig.result);
// Make firebase reachable through the console.
window.firebase = firebase;

// Starts the IP Filter.
IpFilter.filterEuCountries();

// Load the app.
$(document).ready(() => {
  const auth = new Auth();
  // Starts the router.
  window.fpRouter = new Router(auth);
});

// Register the Service Worker that enables offline.
if ('serviceWorker' in navigator) {
  // Use the window load event to keep the page load performant
  $(window).on('load', () => {
    window.navigator.serviceWorker.register('/workbox-sw.js');
  });
}

// Initialize Google Analytics.
import(/* webpackPrefetch: true */ 'universal-ga').then((analytics) => {
  analytics.initialize('UA-25993200-10');
  analytics.pageview('/');
});

// Start the offline indicator listener.
Utils.startOfflineListener();
