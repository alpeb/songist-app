var recordsPerpage = 50;

var songist = angular.module('songist', ['ngRoute']);

songist.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/genres', {
      templateUrl: 'genres.html',
      controller: 'GenresCtrl',
      activetab: 'genres'
    }).
    when('/artists', {
      templateUrl: 'artists.html',
      controller: 'ArtistsCtrl',
      activetab: 'artists'
    }).
    when('/albums', {
      templateUrl: 'albums.html',
      controller: 'AlbumsCtrl',
      activetab: 'albums'
    }).
    when('/tracks', {
      templateUrl: 'tracks.html',
      controller: 'TracksCtrl',
      activetab: 'tracks'
    }).
    when('/queue', {
      templateUrl: 'queue.html',
      controller: 'QueueCtrl',
      activetab: 'queue'
    }).
    when('/playlists/:playlist', {
      templateUrl: 'playlists.html',
      controller: 'PlaylistsCtrl',
      activetab: 'playlists'
    }).
    otherwise({
      redirectTo: '/genres'
    })
}]);

// if I don't have this then playlist and generated image srcs links will have a problem
songist.config(['$compileProvider', function($compileProvider) {
  $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|file|chrome-extension):/);
  $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|ftp|file|chrome-extension):|data:image\//);
}]);
