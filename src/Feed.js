/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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
import 'firebase/auth';
import {MaterialUtils} from './Utils';
import Post from './Post';

/**
 * Handles the Home and Feed UI.
 */
export default class Feed {
  /**
   * Initializes the Friendly Pix feeds.
   * @constructor
   */
  constructor(firebaseHelper) {
    this.firebaseHelper = firebaseHelper;

    // List of all posts on the page.
    this.posts = [];
    // Map of posts that can be displayed.
    this.newPosts = {};

    // Firebase SDK.
    this.auth = firebase.auth();

    // Pointers to DOM elements.
    this.pageFeed = $('#page-feed');
    this.feedImageContainer = $('.fp-image-container', this.pageFeed);
    this.noPostsMessage = $('.fp-no-posts', this.pageFeed);
    this.nextPageButton = $('.fp-next-page-button button');
    this.newPostsButton = $('.fp-new-posts-button button');

    // Event bindings.
    this.newPostsButton.click(() => this.showNewPosts());
  }

  /**
   * Appends the given list of `posts`.
   */
  addPosts(posts) {
    // Displays the list of posts
    const postIds = Object.keys(posts);
    for (let i = postIds.length - 1; i >= 0; i--) {
      this.noPostsMessage.hide();
      const postData = posts[postIds[i]];
      const post = new Post(this.firebaseHelper, postIds[i]);
      this.posts.push(post);
      const postElement = post.postElement;
      // If a post with similar ID is already in the feed we replace it instead of appending.
      const existingPostElement = $(`.fp-post-${postIds[i]}`, this.feedImageContainer);
      if (existingPostElement.length) {
        existingPostElement.replaceWith(postElement);
      } else {
        this.feedImageContainer.append(postElement.addClass(`fp-post-${postIds[i]}`));
      }
      post.fillPostData(postIds[i], postData.thumb_url || postData.url,
          postData.text, postData.author, postData.timestamp, postData.thumb_storage_uri,
          postData.full_storage_uri, postData.full_url);
    }
  }

  /**
   * Shows the "load next page" button and binds it the `nextPage` callback. If `nextPage` is `null`
   * then the button is hidden.
   */
  toggleNextPageButton(nextPage) {
    this.nextPageButton.unbind('click');
    if (nextPage) {
      const loadMorePosts = async () => {
        this.nextPageButton.prop('disabled', true);
        console.log('Loading next page of posts.');
        const data = await nextPage();
        this.addPosts(data.entries);
        this.toggleNextPageButton(data.nextPage);
      };
      this.nextPageButton.show();
      // Enable infinite Scroll.
      MaterialUtils.onEndScroll(100).then(loadMorePosts);
      this.nextPageButton.prop('disabled', false);
      this.nextPageButton.click(loadMorePosts);
    } else {
      this.nextPageButton.hide();
    }
  }

  /**
   * Prepends the list of new posts stored in `this.newPosts`. This happens when the user clicks on
   * the "Show new posts" button.
   */
  showNewPosts() {
    const newPosts = this.newPosts;
    this.newPosts = {};
    this.newPostsButton.hide();
    const postKeys = Object.keys(newPosts);

    for (let i = 0; i < postKeys.length; i++) {
      this.noPostsMessage.hide();
      const post = newPosts[postKeys[i]];
      const postElement = new Post(this.firebaseHelper, postKeys[i]);
      this.posts.push(postElement);
      this.feedImageContainer.prepend(postElement.postElement);
      postElement.fillPostData(postKeys[i], post.thumb_url ||
          post.url, post.text, post.author, post.timestamp, null, null, post.full_url);
    }
  }

  /**
   * Displays the general posts feed.
   */
  async showGeneralFeed() {
    // Clear previously displayed posts if any.
    this.clear();

    // Listen for posts deletions.
    this.firebaseHelper.registerForPostsDeletion((postId) => this.onPostDeleted(postId));

    // Load initial batch of posts.
    const data = await this.firebaseHelper.getPosts();
    // Listen for new posts.
    const latestPostId = Object.keys(data.entries)[Object.keys(data.entries).length - 1];
    this.firebaseHelper.subscribeToGeneralFeed(
        (postId, postValue) => this.addNewPost(postId, postValue), latestPostId);

    // Adds fetched posts and next page button if necessary.
    this.addPosts(data.entries);
    this.toggleNextPageButton(data.nextPage);
  }

  /**
   * Shows the feed showing all followed users.
   */
  async showHomeFeed() {
    // Clear previously displayed posts if any.
    this.clear();

    if (this.auth.currentUser) {
      // Make sure the home feed is updated with followed users's new posts.
      await this.firebaseHelper.updateHomeFeeds();

      // Add new posts from followers live.
      this.firebaseHelper.startHomeFeedLiveUpdaters();

      // Listen for posts deletions.
      this.firebaseHelper.registerForPostsDeletion((postId) => this.onPostDeleted(postId));

      // Load initial batch of posts.
      const data = await this.firebaseHelper.getHomeFeedPosts();
      const postIds = Object.keys(data.entries);
      if (postIds.length === 0) {
        this.noPostsMessage.fadeIn();
      }
      // Listen for new posts.
      const latestPostId = postIds[postIds.length - 1];
      this.firebaseHelper.subscribeToHomeFeed((postId, postValue) => {
        this.addNewPost(postId, postValue);
      }, latestPostId);

      // Adds fetched posts and next page button if necessary.
      this.addPosts(data.entries);
      this.toggleNextPageButton(data.nextPage);
    }
  }

  /**
   * Triggered when a post has been deleted.
   */
  onPostDeleted(postId) {
    // Potentially remove post from in-memory new post list.
    if (this.newPosts[postId]) {
      delete this.newPosts[postId];
      const nbNewPosts = Object.keys(this.newPosts).length;
      this.newPostsButton.text(`Display ${nbNewPosts} new posts`);
      if (nbNewPosts === 0) {
        this.newPostsButton.hide();
      }
    }

    // Potentially delete from the UI.
    $(`.fp-post-${postId}`, this.pageFeed).remove();
  }

  /**
   * Adds a new post to display in the queue.
   */
  addNewPost(postId, postValue) {
    this.newPosts[postId] = postValue;
    this.newPostsButton.text(`Display ${Object.keys(this.newPosts).length} new posts`);
    this.newPostsButton.show();
  }

  /**
   * Clears the UI.
   */
  clear() {
    // Delete the existing posts if any.
    $('.fp-post', this.feedImageContainer).remove();

    // Hides the "next page" and "new posts" buttons.
    this.nextPageButton.hide();
    this.newPostsButton.hide();

    // Remove any click listener on the next page button.
    this.nextPageButton.unbind('click');

    // Stops then infinite scrolling listeners.
    MaterialUtils.stopOnEndScrolls();

    // Clears the list of upcoming posts to display.
    this.newPosts = {};

    // Displays the help message for empty feeds.
    this.noPostsMessage.hide();

    // Remove Firebase listeners.
    this.firebaseHelper.cancelAllSubscriptions();

    // Stops all timers if any.
    this.posts.forEach((post) => post.clear());
    this.posts = [];
  }
};
