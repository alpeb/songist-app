songist.controller('PlayerCtrl', ['$scope', '$location', '$route', 'Tracks', 'MediaGalleries', 'Queue', function($scope, $location, $route, Tracks, MediaGalleries, Queue) {

  var shuffled = false;

  $scope.player = document.getElementById('player');
  $scope.history = [];
  $scope.duration;
  $scope.currentTime;
  $scope.repeatPressed = false;

  $scope.playpause = function(clicked) {
    var playPauseIcon = $('#playPause');
    if ($scope.player.paused) {
      if (!$scope.currentTrack.track && clicked) {
        $.when(Queue.getFirst()).then(function(track) {
          $scope.$apply(function() {
            if (track) {
              $scope.playNextInQueue(track);
            } else {
              $scope.playNextFiltered();
            }
          });
        });
      } else {
        $scope.player.play();
        playPauseIcon
          .removeClass('icon-play')
          .removeClass('icon-spinner')
          .removeClass('icon-spin')
          .addClass('icon-pause');
      }
    } else {
      $scope.player.pause();
      playPauseIcon
        .removeClass('icon-pause')
        .removeClass('icon-spinner')
        .removeClass('icon-spin')
        .addClass('icon-play');
    }

    if (clicked) {
      console.log("Event: Play/Pause");
    }
  };

  $scope.playNextInQueue = function(track) {
    $scope.selectTrack(track, true);
  };

  $scope.playNextFiltered = function() {
    $.when(Tracks.getNext(
        $scope.currentTrackFiltered.track,
        $scope.genre.name,
        $scope.artist.name,
        $scope.album.name,
        $location.search().q)
    ).then(function(track) {
      if (track) {
        $scope.$apply(function() {
          $scope.selectTrack(track);
        });
      } else {
        // rewind list
        $.when(Tracks.getNext(
            null,
            $scope.genre.name,
            $scope.artist.name,
            $scope.album.name,
            $location.search().q)
        ).then(function(track) {
          if (track) {
            $scope.$apply(function() {
              $scope.selectTrack(track);
            });
          }
        });
      }
    });
  };

  $scope.selectTrack = function(track, queued) {
    // selecting the next track might take a couple of secs.
    // Stop currently play one to avoid confusion
    $scope.player.pause();

    if (queued) {
      $scope.currentTrackQueued.track = track;
      $scope.currentTrack = $scope.currentTrackQueued;
      $scope.history.push({track: track, queued: true});
    } else {
      $scope.currentTrackQueued.track = null;
      $scope.currentTrackFiltered.track = track;
      $scope.currentTrack = $scope.currentTrackFiltered;
      $scope.history.push({track: track, queued: false});
    }
    $('#playPause').removeClass('icon-play').addClass('icon-spinner').addClass('icon-spin');

    $.when(MediaGalleries.selectTrack(track)).then(function(result) {
      $scope.$apply(function() {
        $scope.player.src = result;
        $scope.playpause();
        if ($scope.trackArtShown) {
          $scope.showTrackArt();
        }
      });
    });
  };

  $scope.lastSongWasInQueue = function() {
    return $scope.currentTrackQueued.track != null;
  };

  $scope.forward = function(clicked) {
    if ($scope.lastSongWasInQueue()) {
      $.when(Queue.getNext(shuffled? null : $scope.currentTrackQueued.track)).then(function(track) {
        $scope.$apply(function() {
          if (track) {
            $scope.playNextInQueue(track);
          } else {
            $.when(Queue.getFirst()).then(function(track) {
              $scope.$apply(function() {
                if (track) {
                  // rewind queue
                  $scope.playNextInQueue(track);
                } else {
                  // continue with next in current filter
                  $scope.msg('Continuing with songs in the current filter...');
                  $scope.playNextFiltered();
                }
              });
            });
          }
        });
      });
      shuffled = false;
    } else {
      $.when(Queue.getFirst()).then(function(track) {
        $scope.$apply(function() {
          if (track) {
            $scope.msg('Continuing with songs in the queue...');
            $scope.playNextInQueue(track);
          } else {
            $scope.playNextFiltered();
          }
        });
      });
    }

    if (clicked) {
      console.log('Event: Forward');
    }
  };

  $scope.backwards = function(replay, clicked) {
    if (!replay && !$scope.player.paused && $scope.currentTime > 2) {
      $scope.player.currentTime = 0;
    } else {
      if (!replay) {
        $scope.history.pop();
      }
      var obj = $scope.history.pop();
      if (obj) {
        $scope.selectTrack(obj.track, obj.queued);
      }
    }

    if (clicked) {
      console.log('Event: Backwards');
    }
  };

  $scope.shuffle = function(clicked) {
    $scope.msg('shuffling queue &nbsp;<i class="icon-spinner icon-spin"></i>', false);
    $.when(Queue.shuffle()).then(function() {
      $scope.$apply(function() {
        if ($location.path() == '/queue') {
          $route.reload();
        }
        $scope.msg('Queue has been shuffled');
        shuffled = true;
      });
    }, function(msg) {
      $scope.$apply(function() {
        $scope.msg(msg);
      });
    });

    if (clicked) {
      console.log('Event: Shuffle');
    }
  };

  $scope.repeat = function(clicked) {
    if ($scope.repeatPressed) {
      $scope.repeatPressed = false;
      $('#btnRepeat').css('color', '#fff');
    } else {
      $scope.repeatPressed = true;
      $('#btnRepeat').css('color', '#ccc');
    }

    if (clicked) {
      console.log('Event: Repeat');
    }
  };

  $scope.updatePlaying = function() {
    $scope.duration = $scope.player.duration;
    $scope.currentTime = $scope.player.currentTime;
    var percent = $scope.currentTime / $scope.duration * 100;
    $('#playingPosition').css('width', percent + '%');

    var currentTime = new Date().valueOf();
    if (currentTime - $scope.mouseMoveTime > 10000) {
      $scope.mouseMoveTime = currentTime;
      if ($scope.currentTrack.track) {
        if (!$scope.trackArtShown) {
          $scope.showTrackArt();
        }
      }
    }
  };

  $scope.seek = function(e) {
    if ($scope.currentTrack.track) {
      var width = e.currentTarget.offsetWidth;
      var begin = e.currentTarget.offsetLeft;
      var seek = e.clientX;
      var percent = (seek - begin) / width;
      var secs = percent * $scope.duration;
      $scope.player.currentTime = secs;
    }
  };

  $scope.playEnded = function() {
    if ($scope.repeatPressed) {
      $scope.backwards(true);
    } else {
      $scope.forward();
    }
  };

  $($scope.player).bind('timeupdate', $scope.updatePlaying);
  $($scope.player).bind('ended', $scope.playEnded);
  $('#volume input').slider().on('slide', function(e) {
    $scope.player.volume = e.value / 100;
  });
}]);

