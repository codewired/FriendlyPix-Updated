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

import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/database';
import 'firebase/storage';
import latinize from 'latinize';

/**
 * Handles all Firebase interactions.
 */
export default class FirebaseHelper {
  /**
   * Number of posts loaded initially and per page for the feeds.
   * @return {number}
   */
  static get POSTS_PAGE_SIZE() {
    return 3;
  }

  /**
   * Number of posts loaded initially and per page for the User Profile page.
   * @return {number}
   */
  static get USER_PAGE_POSTS_PAGE_SIZE() {
    return 6;
  }

  /**
   * Number of posts loaded initially and per page for the hashtag search page.
   * @return {number}
   */
  static get HASHTAG_PAGE_POSTS_PAGE_SIZE() {
    return 9;
  }

  /**
   * Number of posts comments loaded initially and per page.
   * @return {number}
   */
  static get COMMENTS_PAGE_SIZE() {
    return 3;
  }

  /**
   * Initializes this Firebase facade.
   * @constructor
   */
  constructor() {
    // Firebase SDK.
    this.database = firebase.database();
    this.storage = firebase.storage();
    this.auth = firebase.auth();

    // Firebase references that are listened to.
    this.firebaseRefs = [];
  }

  /**
   * Turns off all Firebase listeners.
   */
  cancelAllSubscriptions() {
    this.firebaseRefs.forEach((ref) => ref.off());
    this.firebaseRefs = [];
  }

  /**
   * Subscribes to receive updates from a post's comments. The given `callback` function gets
   * called for each new comment to the post with ID `postId`.
   *
   * If provided we'll only listen to comments that were posted after `latestCommentId`.
   */
  subscribeToComments(postId, callback, latestCommentId) {
    return this._subscribeToFeed(`/comments/${postId}`, callback, latestCommentId, false);
  }

  /**
   * Paginates comments from the post with ID `postId`.
   *
   * Fetches a page of `COMMENTS_PAGE_SIZE` comments from the post.
   *
   * We return a `Promise` which resolves with an Map of comments and a function to the next page or
   * `null` if there is no next page.
   */
  getComments(postId) {
    return this._getPaginatedFeed(`/comments/${postId}`,
        FirebaseHelper.COMMENTS_PAGE_SIZE, null, false);
  }

  /**
   * Subscribes to receive updates to the general posts feed. The given `callback` function gets
   * called for each new post to the general post feed.
   *
   * If provided we'll only listen to posts that were posted after `latestPostId`.
   */
  subscribeToGeneralFeed(callback, latestPostId) {
    return this._subscribeToFeed('/posts/', callback, latestPostId);
  }

  /**
   * Paginates posts from the global post feed.
   *
   * Fetches a page of `POSTS_PAGE_SIZE` posts from the global feed.
   *
   * We return a `Promise` which resolves with an Map of posts and a function to the next page or
   * `null` if there is no next page.
   */
  getPosts() {
    return this._getPaginatedFeed('/posts/', FirebaseHelper.POSTS_PAGE_SIZE);
  }

  /**
   * Subscribes to receive updates to the home feed. The given `callback` function gets called for
   * each new post to the general post feed.
   *
   * If provided we'll only listen to posts that were posted after `latestPostId`.
   */
  subscribeToHomeFeed(callback, latestPostId) {
    return this._subscribeToFeed(`/feed/${this.auth.currentUser.uid}`, callback, latestPostId,
        true);
  }

  /**
   * Paginates posts from the user's home feed.
   *
   * Fetches a page of `POSTS_PAGE_SIZE` posts from the user's home feed.
   *
   * We return a `Promise` which resolves with an Map of posts and a function to the next page or
   * `null` if there is no next page.
   */
  getHomeFeedPosts() {
    return this._getPaginatedFeed(`/feed/${this.auth.currentUser.uid}`,
        FirebaseHelper.POSTS_PAGE_SIZE, null, true);
  }

  /**
   * Subscribes to receive updates to a user feed. The given `callback` function gets called for
   * each new post to a user page post feed.
   *
   * If provided we'll only listen to posts that were posted after `latestPostId`.
   */
  subscribeToUserFeed(uid, callback, latestPostId) {
    return this._subscribeToFeed(`/people/${uid}/posts`, callback,
        latestPostId, true);
  }

  /**
   * Subscribes to receive updates to a hastag feed. The given `callback` function gets called for
   * each new post to a hashtag search posts feed.
   *
   * If provided we'll only listen to posts that were posted after `latestPostId`.
   */
  subscribeToHashtagFeed(hashtag, callback, latestPostId) {
    return this._subscribeToFeed(`/hashtags/${hashtag}`, callback,
        latestPostId, true);
  }

  /**
   * Paginates posts from the user's posts feed.
   *
   * Fetches a page of `USER_PAGE_POSTS_PAGE_SIZE` posts from the user's posts feed.
   *
   * We return a `Promise` which resolves with an Map of posts and a function to the next page or
   * `null` if there is no next page.
   */
  getUserFeedPosts(uid) {
    return this._getPaginatedFeed(`/people/${uid}/posts`,
        FirebaseHelper.USER_PAGE_POSTS_PAGE_SIZE, null, true);
  }

  /**
   * Paginates posts containting the given hashtag in the description.
   *
   * Fetches a page of `HASHTAG_PAGE_POSTS_PAGE_SIZE` posts from the hashtag's posts feed.
   *
   * We return a `Promise` which resolves with an Map of posts and a function to the next page or
   * `null` if there is no next page.
   */
  getHastagsPosts(hashtag) {
    return this._getPaginatedFeed(`/hashtags/${hashtag}`,
        FirebaseHelper.HASHTAG_PAGE_POSTS_PAGE_SIZE, null, true);
  }

  /**
   * Subscribes to receive updates to the given feed. The given `callback` function gets called
   * for each new entry on the given feed.
   *
   * If provided we'll only listen to entries that were posted after `latestEntryId`. This allows to
   * listen only for new feed entries after fetching existing entries using `_getPaginatedFeed()`.
   *
   * If needed the posts details can be fetched. This is useful for shallow post feeds.
   * @private
   */
  _subscribeToFeed(uri, callback, latestEntryId = null, fetchPostDetails = false) {
    // Load all posts information.
    let feedRef = this.database.ref(uri);
    if (latestEntryId) {
      feedRef = feedRef.orderByKey().startAt(latestEntryId);
    }
    feedRef.on('child_added', (feedData) => {
      if (feedData.key !== latestEntryId) {
        if (!fetchPostDetails) {
          callback(feedData.key, feedData.val());
        } else {
          this.database.ref(`/posts/${feedData.key}`).once('value').then(
              (postData) => callback(postData.key, postData.val()));
        }
      }
    });
    this.firebaseRefs.push(feedRef);
  }

  /**
   * Paginates entries from the given feed.
   *
   * Fetches a page of `pageSize` entries from the given feed.
   *
   * If provided we'll return entries that were posted before (and including) `earliestEntryId`.
   *
   * We return a `Promise` which resolves with an Map of entries and a function to the next page or
   * `null` if there is no next page.
   *
   * If needed the posts details can be fetched. This is useful for shallow post feeds like the user
   * home feed and the user post feed.
   * @private
   */
  _getPaginatedFeed(uri, pageSize, earliestEntryId = null, fetchPostDetails = false) {
    console.log('Fetching entries from', uri, 'start at', earliestEntryId, 'page size', pageSize);
    let ref = this.database.ref(uri);
    if (earliestEntryId) {
      ref = ref.orderByKey().endAt(earliestEntryId);
    }
    // We're fetching an additional item as a cheap way to test if there is a next page.
    return ref.limitToLast(pageSize + 1).once('value').then((data) => {
      const entries = data.val() || {};

      // Figure out if there is a next page.
      let nextPage = null;
      const entryIds = Object.keys(entries);
      if (entryIds.length > pageSize) {
        delete entries[entryIds[0]];
        const nextPageStartingId = entryIds.shift();
        nextPage = () => this._getPaginatedFeed(
            uri, pageSize, nextPageStartingId, fetchPostDetails);
      }
      if (fetchPostDetails) {
        // Fetch details of all posts.
        const queries = entryIds.map((postId) => this.getPostData(postId));
        // Since all the requests are being done one the same feed it's unlikely that a single one
        // would fail and not the others so using Promise.all() is not so risky.
        return Promise.all(queries).then((results) => {
          const deleteOps = [];
          results.forEach((result) => {
            if (result.val()) {
              entries[result.key] = result.val();
            } else {
              // We encountered a deleted post. Removing permanently from the feed.
              delete entries[result.key];
              deleteOps.push(this.deleteFromFeed(uri, result.key));
            }
          });
          if (deleteOps.length > 0) {
            // We had to remove some deleted posts from the feed. Lets run the query again to get
            // the correct number of posts.
            return this._getPaginatedFeed(uri, pageSize, earliestEntryId, fetchPostDetails);
          }
          return {entries: entries, nextPage: nextPage};
        });
      }
      return {entries: entries, nextPage: nextPage};
    });
  }

  /**
   * Keeps the home feed populated with latest followed users' posts live.
   */
  startHomeFeedLiveUpdaters() {
    // Make sure we listen on each followed people's posts.
    const followingRef = this.database.ref(`/people/${this.auth.currentUser.uid}/following`);
    this.firebaseRefs.push(followingRef);
    followingRef.on('child_added', (followingData) => {
      // Start listening the followed user's posts to populate the home feed.
      const followedUid = followingData.key;
      let followedUserPostsRef = this.database.ref(`/people/${followedUid}/posts`);
      if (followingData.val() instanceof String) {
        followedUserPostsRef = followedUserPostsRef.orderByKey().startAt(followingData.val());
      }
      this.firebaseRefs.push(followedUserPostsRef);
      followedUserPostsRef.on('child_added', (postData) => {
        if (postData.key !== followingData.val()) {
          const updates = {};
          updates[`/feed/${this.auth.currentUser.uid}/${postData.key}`] = true;
          updates[`/people/${this.auth.currentUser.uid}/following/${followedUid}`] = postData.key;
          this.database.ref().update(updates);
        }
      });
    });
    // Stop listening to users we unfollow.
    followingRef.on('child_removed', (followingData) => {
      // Stop listening the followed user's posts to populate the home feed.
      const followedUserId = followingData.key;
      this.database.ref(`/people/${followedUserId}/posts`).off();
    });
  }

  /**
   * Updates the home feed with new followed users' posts and returns a promise once that's done.
   */
  updateHomeFeeds() {
    // Make sure we listen on each followed people's posts.
    const followingRef = this.database.ref(`/people/${this.auth.currentUser.uid}/following`);
    return followingRef.once('value').then((followingData) => {
      // Start listening the followed user's posts to populate the home feed.
      const following = followingData.val();
      if (!following) {
        return;
      }
      const updateOperations = Object.keys(following).map((followedUid) => {
        let followedUserPostsRef = this.database.ref(`/people/${followedUid}/posts`);
        const lastSyncedPostId = following[followedUid];
        if (lastSyncedPostId instanceof String) {
          followedUserPostsRef = followedUserPostsRef.orderByKey().startAt(lastSyncedPostId);
        }
        return followedUserPostsRef.once('value').then((postData) => {
          const updates = {};
          if (!postData.val()) {
            return;
          }
          Object.keys(postData.val()).forEach((postId) => {
            if (postId !== lastSyncedPostId) {
              updates[`/feed/${this.auth.currentUser.uid}/${postId}`] = true;
              updates[`/people/${this.auth.currentUser.uid}/following/${followedUid}`] = postId;
            }
          });
          return this.database.ref().update(updates);
        });
      });
      return Promise.all(updateOperations);
    });
  }

  /**
   * Returns the hashtags which name match the given search query as a Promise.
   */
  searchHashtags(searchString, maxResults) {
    searchString = latinize(searchString).toLowerCase();
    return this.database.ref('/hashtags').orderByKey().startAt(searchString)
        .limitToFirst(maxResults).once('value').then((result) => {
          const hashtagsData = {};
          // construct people from the two search queries results.
          result.forEach((data) => {
            hashtagsData[data.key] = data.val();
          });

          // Remove results that do not start with the search query.
          const hashtags = Object.keys(hashtagsData);
          hashtags.forEach((hashtag) => {
            if (!hashtag.startsWith(searchString)) {
              delete hashtagsData[hashtag];
            }
          });
          return hashtagsData;
        });
  }

  /**
   * Returns the users which name match the given search query as a Promise.
   */
  searchUsers(searchString, maxResults) {
    searchString = latinize(searchString).toLowerCase();
    const query = this.database.ref('/people')
        .orderByChild('_search_index/full_name').startAt(searchString)
        .limitToFirst(maxResults).once('value');
    const reversedQuery = this.database.ref('/people')
        .orderByChild('_search_index/reversed_full_name').startAt(searchString)
        .limitToFirst(maxResults).once('value');
    return Promise.all([query, reversedQuery]).then((results) => {
      const people = {};
      // construct people from the two search queries results.
      results.forEach((result) => result.forEach((data) => {
        people[data.key] = data.val();
      }));

      // Remove results that do not start with the search query.
      const userIds = Object.keys(people);
      userIds.forEach((userId) => {
        const name = latinize(people[userId]._search_index.full_name).toLowerCase();
        const reversedName = latinize(people[userId]._search_index.reversed_full_name).toLowerCase();
        if (!name.startsWith(searchString) && !reversedName.startsWith(searchString)) {
          delete people[userId];
        }
      });
      return people;
    });
  }

  /**
   * Saves or updates public user data in Firebase (such as image URL, display name...).
   */
  updatePublicProfile() {
    const user = firebase.auth().currentUser;
    let displayName = user.displayName;
    let imageUrl = user.photoURL;

    // If the main profile Pic is an expiring facebook profile pic URL we'll update it automatically to use the permanent graph API URL.
    if (imageUrl && (imageUrl.indexOf('lookaside.facebook.com') !== -1 || imageUrl.indexOf('fbcdn.net') !== -1)) {
      // Fid the user's Facebook UID.
      const facebookUID = user.providerData.find((providerData) => providerData.providerId === 'facebook.com').uid;
      imageUrl = `https://graph.facebook.com/${facebookUID}/picture?type=large`;
      user.updateProfile({photoURL: imageUrl}).then(() => {
        console.log('User profile updated.');
      });
    }

    if (!displayName) {
      displayName = 'Anonymous';
    }
    let searchFullName = displayName.toLowerCase();
    let searchReversedFullName = searchFullName.split(' ').reverse().join(' ');
    try {
      searchFullName = latinize(searchFullName);
      searchReversedFullName = latinize(searchReversedFullName);
    } catch (e) {
      console.error(e);
    }

    this.getPrivacySettings(user.uid).then((snapshot) => {
      let socialEnabled = false;
      if (snapshot.val() !== null) {
        socialEnabled = snapshot.val().social;
      }

      const updateData = {
        profile_picture: imageUrl || null,
        full_name: displayName,
      };

      if (socialEnabled) {
        updateData._search_index = {
          full_name: searchFullName,
          reversed_full_name: searchReversedFullName,
        };
      };
      return this.database.ref(`/people/${user.uid}`).update(updateData).then(() => {
        console.log('Public profile updated.');
      });
    });
  }

  /**
   * Fetches a single post data.
   */
  getPostData(postId) {
    return this.database.ref(`/posts/${postId}`).once('value');
  }

  /**
   * Fetches the user's privacy settings.
   */
  getPrivacySettings(uid) {
    return this.database.ref(`/privacy/${uid}`).once('value');
  }

  setPrivacySettings(uid, settings) {
    const uri = `/privacy/${uid}`;
    this.database.ref(uri).set(settings);
  }

  removeFromSearch(uid) {
    this.database.ref(`people/${uid}/_search_index`).remove();
  }

  /**
   * Subscribe to receive updates on a user's post like status.
   */
  registerToUserLike(postId, callback) {
    // Load and listen to new Likes.
    const likesRef = this.database.ref(`likes/${postId}/${this.auth.currentUser.uid}`);
    likesRef.on('value', (data) => callback(!!data.val()));
    this.firebaseRefs.push(likesRef);
  }

  /**
   * Updates the like status of a post from the current user.
   */
  updateLike(postId, value) {
    return this.database.ref(`likes/${postId}/${this.auth.currentUser.uid}`)
        .set(value ? firebase.database.ServerValue.TIMESTAMP : null);
  }

  /**
   * Adds a comment to a post.
   */
  addComment(postId, commentText) {
    const commentObject = {
      text: commentText,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      author: {
        uid: this.auth.currentUser.uid,
        full_name: this.auth.currentUser.displayName || 'Anonymous',
        profile_picture: this.auth.currentUser.photoURL || null,
      },
    };
    return this.database.ref(`comments/${postId}`).push(commentObject);
  }

  /**
   * Deletes a comment.
   */
  deleteComment(postId, commentId) {
    return this.database.ref(`/comments/${postId}/${commentId}`).remove();
  }

  /**
   * Edit a comment.
   */
  editComment(postId, commentId, commentText) {
    return this.database.ref(`/comments/${postId}/${commentId}`).update({
      text: commentText,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
    });
  }

  /**
   * Subscribe to a comment update.
   */
  subscribeToComment(postId, commentId, callback) {
    const commentRef = this.database.ref(`/comments/${postId}/${commentId}`);
    commentRef.on('value', callback);
    this.firebaseRefs.push(commentRef);
  }

  /**
   * Uploads a new Picture to Cloud Storage and adds a new post referencing it.
   * This returns a Promise which completes with the new Post ID.
   */
  uploadNewPic(pic, thumb, fileName, text) {
    // Get a reference to where the post will be created.
    const newPostKey = this.database.ref('/posts').push().key;

    // Start the pic file upload to Cloud Storage.
    const picRef = this.storage.ref(`${this.auth.currentUser.uid}/full/${newPostKey}/${fileName}`);
    const metadata = {
      contentType: pic.type,
    };
    const picUploadTask = picRef.put(pic, metadata).then((snapshot) => {
      console.log('New pic uploaded. Size:', snapshot.totalBytes, 'bytes.');
      return snapshot.ref.getDownloadURL().then((url) => {
        console.log('File available at', url);
        return url;
      });
    }).catch((error) => {
      console.error('Error while uploading new pic', error);
    });

    // Start the thumb file upload to Cloud Storage.
    const thumbRef = this.storage.ref(`${this.auth.currentUser.uid}/thumb/${newPostKey}/${fileName}`);
    const tumbUploadTask = thumbRef.put(thumb, metadata).then((snapshot) => {
      console.log('New thumb uploaded. Size:', snapshot.totalBytes, 'bytes.');
      return snapshot.ref.getDownloadURL().then((url) => {
        console.log('File available at', url);
        return url;
      });
    }).catch((error) => {
      console.error('Error while uploading new thumb', error);
    });

    return Promise.all([picUploadTask, tumbUploadTask]).then((urls) => {
      // Once both pics and thumbnails has been uploaded add a new post in the Firebase Database and
      // to its fanned out posts lists (user's posts and home post).
      const update = {};
      update[`/posts/${newPostKey}`] = {
        full_url: urls[0],
        thumb_url: urls[1],
        text: text,
        client: 'web',
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        full_storage_uri: picRef.toString(),
        thumb_storage_uri: thumbRef.toString(),
        author: {
          uid: this.auth.currentUser.uid,
          full_name: this.auth.currentUser.displayName || 'Anonymous',
          profile_picture: this.auth.currentUser.photoURL || null,
        },
      };
      update[`/people/${this.auth.currentUser.uid}/posts/${newPostKey}`] = true;
      update[`/feed/${this.auth.currentUser.uid}/${newPostKey}`] = true;
      return this.database.ref().update(update).then(() => newPostKey);
    });
  }

  /**
   * Follow/Unfollow a user and return a promise once that's done.
   *
   * If the user is now followed we'll add all his posts to the home feed of the follower.
   * If the user is now not followed anymore all his posts are removed from the follower home feed.
   */
  toggleFollowUser(followedUserId, follow) {
    // Add or remove posts to the user's home feed.
    return this.database.ref(`/people/${followedUserId}/posts`).once('value').then(
        (data) => {
          const updateData = {};
          let lastPostId = true;

          // Add/remove followed user's posts to the home feed.
          data.forEach((post) => {
            updateData[`/feed/${this.auth.currentUser.uid}/${post.key}`] = follow ? !!follow : null;
            lastPostId = post.key;
          });

          // Add/remove followed user to the 'following' list.
          updateData[`/people/${this.auth.currentUser.uid}/following/${followedUserId}`] =
              follow ? lastPostId : null;

          // Add/remove signed-in user to the list of followers.
          updateData[`/followers/${followedUserId}/${this.auth.currentUser.uid}`] =
              follow ? !!follow : null;
          return this.database.ref().update(updateData);
        });
  }

  /**
   * Blocks/Unblocks a user and return a promise once that's done.
   */
  toggleBlockUser(followedUserId, block) {
    // Add or remove posts to the user's home feed.
    const update = {};
    update[`/blocking/${this.auth.currentUser.uid}/${followedUserId}`] = block ? !!block : null;
    update[`/blocked/${followedUserId}/${this.auth.currentUser.uid}`] = block ? !!block : null;

    return this.database.ref().update(update);
  }

  /**
   * Listens to updates on the followed status of the given user.
   */
  registerToFollowStatusUpdate(userId, callback) {
    const followStatusRef =
        this.database.ref(`/people/${this.auth.currentUser.uid}/following/${userId}`);
    followStatusRef.on('value', callback);
    this.firebaseRefs.push(followStatusRef);
  }

  /**
   * Listens to updates on the blocked status of the given user.
   */
  registerToBlockedStatusUpdate(userId, callback) {
    const blockStatusRef =
        this.database.ref(`/blocking/${this.auth.currentUser.uid}/${userId}`);
    blockStatusRef.on('value', callback);
    this.firebaseRefs.push(blockStatusRef);
  }

  /**
   * Enables or disables the notifications for that user.
   */
  toggleNotificationEnabled(checked) {
    return this.database.ref(`/people/${this.auth.currentUser.uid}/notificationEnabled`)
        .set(checked ? checked : null);
  }

  /**
   * Saves the given notification token.
   */
  saveNotificationToken(token) {
    return this.database.ref(`/people/${this.auth.currentUser.uid}/notificationTokens/${token}`)
        .set(true);
  }

  /**
   * Listens to updates on the Enable notifications status of the current user.
   */
  registerToNotificationEnabledStatusUpdate(callback) {
    const followStatusRef =
        this.database.ref(`/people/${this.auth.currentUser.uid}/notificationEnabled`);
    followStatusRef.on('value', callback);
    this.firebaseRefs.push(followStatusRef);
  }

  /**
   * Load a single user profile information
   */
  loadUserProfile(uid) {
    return this.database.ref(`/people/${uid}`).once('value');
  }

  /**
   * Listens to updates on the likes of a post and calls the callback with likes counts.
   * TODO: This won't scale if a user has a huge amount of likes. We need to keep track of a
   *       likes count instead.
   */
  registerForLikesCount(postId, likesCallback) {
    const likesRef = this.database.ref(`/likes/${postId}`);
    likesRef.on('value', (data) => likesCallback(data.numChildren()));
    this.firebaseRefs.push(likesRef);
  }

  /**
   * Listens to updates on the comments of a post and calls the callback with comments counts.
   */
  registerForCommentsCount(postId, commentsCallback) {
    const commentsRef = this.database.ref(`/comments/${postId}`);
    commentsRef.on('value', (data) => commentsCallback(data.numChildren()));
    this.firebaseRefs.push(commentsRef);
  }

  /**
   * Listens to updates on the followers of a person and calls the callback with followers counts.
   * TODO: This won't scale if a user has a huge amount of followers. We need to keep track of a
   *       follower count instead.
   */
  registerForFollowersCount(uid, followersCallback) {
    const followersRef = this.database.ref(`/followers/${uid}`);
    followersRef.on('value', (data) => followersCallback(data.numChildren()));
    this.firebaseRefs.push(followersRef);
  }

  /**
   * Listens to updates on the followed people of a person and calls the callback with its count.
   */
  registerForFollowingCount(uid, followingCallback) {
    const followingRef = this.database.ref(`/people/${uid}/following`);
    followingRef.on('value', (data) => followingCallback(data.numChildren()));
    this.firebaseRefs.push(followingRef);
  }

  /**
   * Listens for changes of the thumbnail URL of a given post.
   */
  registerForThumbChanges(postId, callback) {
    const thumbRef = this.database.ref(`/posts/${postId}/thumb_url`);
    thumbRef.on('value', (data) => callback(data.val()));
    this.firebaseRefs.push(thumbRef);
  }

  /**
   * Fetch the list of followed people's profile.
   */
  getFollowingProfiles(uid) {
    return this.database.ref(`/people/${uid}/following`).once('value').then((data) => {
      if (data.val()) {
        const followingUids = Object.keys(data.val());
        const fetchProfileDetailsOperations = followingUids.map(
            (followingUid) => this.loadUserProfile(followingUid));
        return Promise.all(fetchProfileDetailsOperations).then((results) => {
          const profiles = {};
          results.forEach((result) => {
            if (result.val()) {
              profiles[result.key] = result.val();
            }
          });
          return profiles;
        });
      }
      return {};
    });
  }

  /**
   * Listens to updates on the user's posts and calls the callback with user posts counts.
   */
  registerForPostsCount(uid, postsCallback) {
    const userPostsRef = this.database.ref(`/people/${uid}/posts`);
    userPostsRef.on('value', (data) => postsCallback(data.numChildren()));
    this.firebaseRefs.push(userPostsRef);
  }

  /**
   * Deletes the given post from the global post feed and the user's post feed. Also deletes
   * comments, likes and the file on Cloud Storage.
   */
  deletePost(postId, picStorageUri, thumbStorageUri) {
    console.log(`Deleting ${postId}`);
    const updateObj = {};
    updateObj[`/people/${this.auth.currentUser.uid}/posts/${postId}`] = null;
    updateObj[`/comments/${postId}`] = null;
    updateObj[`/likes/${postId}`] = null;
    updateObj[`/posts/${postId}`] = null;
    updateObj[`/feed/${this.auth.currentUser.uid}/${postId}`] = null;
    const deleteFromDatabase = this.database.ref().update(updateObj);
    if (picStorageUri) {
      let deletePicFromStorage;
      let deleteThumbFromStorage;
      if (picStorageUri.startsWith('gs:/')) {
        deletePicFromStorage = this.storage.refFromURL(picStorageUri).delete();
        deleteThumbFromStorage = this.storage.refFromURL(thumbStorageUri).delete();
      } else {
        deletePicFromStorage = this.storage.ref(picStorageUri).delete();
        deleteThumbFromStorage = this.storage.ref(thumbStorageUri).delete();
      }
      return Promise.all([deleteFromDatabase, deletePicFromStorage, deleteThumbFromStorage]);
    }
    return deleteFromDatabase;
  }

  /**
   * Flags the posts for inappropriate content.
   */
  reportPost(postId) {
    return this.database.ref(`/postFlags/${postId}/${this.auth.currentUser.uid}`).set(true);
  }

  /**
   * Flags the comment for inappropriate content.
   */
  reportComment(postId, commentId) {
    return this.database.ref(`/commentFlags/${postId}/${commentId}/${this.auth.currentUser.uid}`).set(true);
  }

  /**
   * Deletes the given postId entry from the user's home feed.
   */
  deleteFromFeed(uri, postId) {
    return this.database.ref(`${uri}/${postId}`).remove();
  }

  /**
   * Listens to deletions on posts from the global feed.
   */
  registerForPostsDeletion(deletionCallback) {
    const postsRef = this.database.ref(`/posts`);
    postsRef.on('child_removed', (data) => deletionCallback(data.key));
    this.firebaseRefs.push(postsRef);
  }
};
