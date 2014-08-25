songist.controller('HomeCtrl', ['$scope', '$location', '$route', '$routeParams', '$http', '$q', 'Tracks', 'Queue', 'Playlists', 'MediaGalleries', function($scope, $location, $route, $routeParams, $http, $q, Tracks, Queue, Playlists, MediaGalleries) {

  $scope.$route = $route;
  $scope.$routeParams = $routeParams;
  $scope.isNewDb = {isNewDb: null};
  $scope.version = chrome.runtime.getManifest().version;
  $scope.search = '';

  // obj to allow inheritance
  // http://stackoverflow.com/questions/16928341/update-parent-scope-variable
  $scope.finishedSearch = {finished: true};
  $scope.lastSearch = {key: null};

  $scope.genre = {name: null};
  $scope.artist = {name: null};
  $scope.album = {name: null};

  $scope.playlists = {playlists: null};

  $scope.currentTrack = {track: null};
  $scope.currentTrackFiltered = {track: null},
  $scope.currentTrackQueued = {track: null},

  $scope.mouseMoveTime = new Date().valueOf();
  $scope.trackArtShown = false;

  $scope.unfilterGenre = function() {
    $scope.genre = {name: null};
    $scope.$route.reload();
  };

  $scope.unfilterArtist = function() {
    $scope.artist = {name: null};
    $scope.$route.reload();
  };

  $scope.unfilterAlbum = function() {
    $scope.album = {name: null};
    $scope.$route.reload();
  };

  $scope.selectGalleries = function() {
    MediaGalleries.select();
  };

  $scope.scan = function() {
    $('#intro').hide();
    $('#processingModal').modal('show');
    var progressBar = $('#progressWrapper .bar');
    MediaGalleries.scan($scope.isNewDb.isNewDb).progress(function(progress) {
      progressBar.css('width', progress + '%');
    }).done(function() {
       $scope.$apply(function() {
         $scope.isNewDb.isNewDb = false;
         $('#progressWrapper').hide();
         $route.reload();
       });
    });
    console.log("Event: Scan music");
  };

  $scope.msg = function(msg, fade) {
    if (typeof fade == 'undefined') {
      fade = 2000;
    }
    var msgObj = $('#msg');
    msgObj.html(msg).fadeIn(400, function() {
      if (fade) {
        setTimeout(function() {
          msgObj.fadeOut(400);
        }, fade)
      }
    });
  };

  /**
  * Only one concurrent search allowed to avoid race conditions
  */
  $scope.updateSearch = function() {
    if ($scope.search) {
      $scope.lastSearch.key = $scope.search;
      if (!$scope.finishedSearch.finished) {
        return;
      } else {
        $location.path('/tracks');
        $location.search({q: $scope.search});
      }
    }
  };

  $scope.resetSearch = function() {
    $scope.search = '';
  };

  $scope.showTrackArt = function() {
    $.when(Tracks.getArt($scope.currentTrack.track)).then(function(art) {
      if (art) {
        var containerWidth = $('#rightContainer').width();
        $('#rightContainer').children().fadeOut(1600);
        $('#playingTrackArt').remove(); // kill any previous art
        $('<img id="playingTrackArt">').attr('src', art)
          .css('width', containerWidth * 0.5)
          .css('left', containerWidth * 0.25) // 0.5 * (1 - 0.5) = 0.25
          .appendTo('#rightContainer').fadeIn(1600);
      } else {
        $scope.hideTrackArt();
      }
      $scope.trackArtShown = true;
    });
  };

  $scope.hideTrackArt = function() {
    $('#playingTrackArt').remove();
    $('#rightContainer').children().show();
    $scope.trackArtShown = false;
  };

  $scope.handleMouseMove = function(e) {
    if ($scope.trackArtShown) {
      $scope.hideTrackArt();
    }
    $scope.mouseMoveTime = new Date().valueOf();
  };

  $scope.enqueue = function(track) {
    $scope.msg('"' + track.title + '" added to queue');
    Queue.push(track);
  };

  $scope.enqueueAll = function(playlist) {
    var msg, fn;
    $scope.msg('Adding tracks to queue &nbsp;<i class="icon-spinner icon-spin"></i>', false);
    if (playlist) {
      msg = 'Playlist "' + playlist + '"';
      fn = function() {return Queue.pushPlaylist(playlist);};
    } else if ($scope.album.name) {
      msg = 'Album "' + $scope.album.name + '"';
      fn = function() {return Queue.pushAll(null, null, $scope.album.name);};
    } else if ($scope.artist.name) {
      msg = 'Artist "' + $scope.artist.name + '"';
      fn = function() {return Queue.pushAll(null, $scope.artist.name);};
    } else if ($scope.genre.name) {
      msg = 'Genre "' + $scope.genre.name + '"';
      fn = function() {return Queue.pushAll($scope.genre.name);};
    } else if ($location.search().q) {
      msg = 'Search results';
      fn = function() {return Queue.pushAll(null, null, null, $location.search().q);};
    } else {
      fn = function() {return Queue.pushAll();}
      msg = 'All tracks';
    }
    $.when(fn()).then(function() {
      $scope.$apply(function() {
        $scope.msg(msg + ' added to queue');
      });
    });
  };

  $scope.loadPlaylists = function() {
    var deferred = $q.defer();
    $.when(Playlists.getPlaylists()).then(function(playlists) {
      $scope.$apply(function() {
        $scope.playlists.playlists = playlists;
        deferred.resolve();
      });

      // outside $scope.$apply cuz I need the playlist to be rendered before this is called
      $scope.initPlaylistsEvents();
    });
    return deferred.promise;
  };

  $scope.initPlaylistsEvents = function() {
    try {
      $('.playlistItem').droppable('destroy');
    } catch (ignore) {
      // ignore exception when droppable is built for the 1st time
    }
    $('.playlistItem').droppable({
      accept: '.playlistDraggable',
      hoverClass: 'playlistsDropTarget',
      drop: function(e, ui) {
        var playlist = $(this).data('playlist');
        $.when(Playlists.addTrack(playlist, ui.draggable.data('path'))
        ).then(function(track) {
          $scope.$apply(function() {
            if (track) {
              $scope.msg('Track "' + track.title + '" added to playlist "' + playlist + '"');
            }
          });
        });
      }
    });
  };

  $scope.initTracksDraggables = function() {
    $('.playlistDraggable').draggable({
      helper: function() {
        return $('<div class="rowDraggableHelper text-center">Drop into a playlist</div>');
      },
      start: function() {
        if ($scope.playlists.playlists.length > 0) {
          $('#ulPlaylists').addClass('playlistsDropTarget');
        }
      },
      stop: function() {
        $('#ulPlaylists').removeClass('playlistsDropTarget');
      }
    });
  };

  $scope.showSettings = function() {
     $('#settingsModal').modal('show');
     console.log("Event: Settings");
  };

  // gotta do the tab switching manually and not through hrefs
  // cuz hrefs cause the app to navigate to genres
  $scope.tabAbout = function() {
    $('#settings').hide();
    $('#about').show();
  };

  $scope.closeSettings = function() {
     $('#settingsModal').modal('hide');
  };

  $scope.showHelp = function() {
     $('#helpModal').modal('show');
     console.log("Event: Help");
  };

  $scope.closeHelp = function() {
     $('#helpModal').modal('hide');
  };

  $scope.adjustHeight = function(adjustment) {
    adjustment = adjustment || 100;
    var bounds = chrome.app.window.current().getBounds();
    var topContent = document.getElementById('top');

    var newHeight = bounds.height - topContent.offsetHeight - adjustment;
    $('.infiniteScroll').css('height', newHeight + "px");

    // total - topBar - bottomBar - nav - search - extraSpace
    var newPlaylistsHeight = bounds.height - 140 - 77 - 305 - 30 - 22;
    $('#wrapperPlaylists').css('height', newPlaylistsHeight + "px");
  };

  $scope.dbError = function(e, error) {
    $scope.$apply(function() {
      $scope.errorTitle = 'Database Error';
      $scope.errorMsg = JSON.stringify(error);
      $('#errorModal').modal('show');
    });
  };

  window.onmousemove = function(e) {
    // Discard spurious click events
    if (Math.abs(e.webkitMovementX) + Math.abs(e.webkitMovementY) > 0) {
      $scope.handleMouseMove();
    }
  }
  window.onmousedown = $scope.handleMouseMove;
  chrome.app.window.current().onBoundsChanged.addListener($scope.adjustHeight);

  $('.statefulBtn').click(function() {
    $(this).button('loading');
  });

  Tracks.setHomeCtrlScope($scope);
  var progressLabelSpan = $('#progressLabelSpan');
  $scope.$on('scanMsg', function(e, msg) {
    progressLabelSpan.text(msg);
  });

  $scope.$on('dbError', $scope.dbError);

  $('a[rel=tooltip]').tooltip();

  $('#playlistsTitle').css('visibility', 'visible');
  $('#wrapperPlaylists').css('visibility', 'visible');

  console.log("View: Home");

  var webview = document.getElementById('webview');
  webview.addEventListener('loadstop', function() {
    webview.contentWindow.postMessage({
      command: 'handshake'
    }, '*');
  });
  webview.addEventListener('newwindow', function(evt) {
    // for example used by CPMoz by their in-house ad
    //console.log("newwindow: ", evt);
    var adLink = document.getElementById('adLink');
    adLink.setAttribute('href', evt.targetUrl);
    adLink.click();
  });
}]);
