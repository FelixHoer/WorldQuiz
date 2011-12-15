var WQ = (function(){

  //### Constants ##############################################################

  var maxRounds = 8;
  var maxRoundTime = 6 * 1000; // ms
  var maxNextTime = 3 * 1000; // ms
  var maxTimePoints = 1000;
  var maxDistancePoints = 4000;

  //### Util ###################################################################

  //----------------------------------------------------------------------------
  var model = function(){
    var currentId = 0;
    
    return function(obj){
      obj || (obj = {});
      var uniqueId = currentId++;

      var id = function(key){
        return ['model', uniqueId, key].join('-');
      };

      var get = function(key){
        var val = key ? obj[key] : value;
        return val;
      };

      var set = function(val){
        for(var key in val){
          obj[key] = val[key];
          $('.' + id(key)).text(val[key]);
        }
      };

      var place = function(key){
        document.write('<span class="' + id(key) + '">' + get(key) + '</span>');
      };

      return {
        get: get,
        set: set,
        place: place
      };
    };
  }();

  //----------------------------------------------------------------------------
  var contains = function(array, value){
    for(var i = 0; i < array.length; i++)
      if(array[i] === value)
        return true;
    return false;
  };

  //----------------------------------------------------------------------------
  var generateRandomUniqueIds = function(number, from, to){
    if(number > to - from)
      throw { msg: 'getRandomIds: to small range', args: arguments };

    var ids = [];
    while(ids.length <= number){
      var id = from + parseInt(Math.random() * (to - from + 1));
      if(!contains(ids, id))
        ids.push(id);
    }
    return ids;
  };

  //----------------------------------------------------------------------------
  var getTime = function(){
    return new Date().getTime();
  };

  //----------------------------------------------------------------------------
  var getTimePercent = function(startTime, maxTime){
    var percent = 100 * (getTime() - startTime) / maxTime;
    return percent > 100 ? 100 : percent;
  };

  //----------------------------------------------------------------------------
  var toRad = function(deg) {
    return deg * Math.PI / 180;
  };

  //----------------------------------------------------------------------------
  var getDistance = function(p1, p2){
    var lat1 = p1.lat(), lon1 = p1.lng();
    var lat2 = p2.lat(), lon2 = p2.lng();

    // based on http://www.movable-type.co.uk/scripts/latlong.html
    var R = 6371; // km
    var dLat = toRad(lat2-lat1);
    var dLon = toRad(lon2-lon1); 
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c;
    // end

    return d;
  };

  //----------------------------------------------------------------------------
  var getDistanceReduction = function(distance){
    var factor = distance/3500.0;
    return (factor > 1) ? 0 : 1 - factor;
  };

  //################################### GAME ###################################
  /*
    map: the google map
    data: the levels
  */
  var startGame = function(map, levels){
    
    var level = 0;

    // states

    var startCurrentLevel = function(){
      startLevel({
        map: map,
        done: levelCompleted,
        levelNum: level+1,
        level: levels[level]
      });
    };

    var levelCompleted = function(){
      var accumulatedPoints = models.level.get('accumulatedPoints');
      var neededPoints = models.level.get('neededPoints');
      
      if(level+1 === levels.length){
        gameWon();
      }else if(accumulatedPoints >= neededPoints){
        level++;
        startCurrentLevel();
      }else{
        gameOver();
      }
    };

    var gameWon = function(){
      $('#gameWon').removeClass('hidden');
    };

    var gameOver = function(){
      $('#gameOver').removeClass('hidden');
      $('#retryButton').one('click', function(){
        $('#gameOver').addClass('hidden');
        startCurrentLevel();
      });
    };

    // start
    startCurrentLevel();

  };

  //################################### LEVEL ##################################
  /*
    data: 
      map: the google map
      done: the callback
      levelNum: number of level
      level: the level, to be played
  */
  var startLevel = function(data){

    var ids = generateRandomUniqueIds(maxRounds, 0, data.level.marks.length);
    var marks = $.map(ids, function(id){
      return data.level.marks[id];
    });

    // states

    var startNextRound = function(){
      var mark = marks.splice(0, 1)[0];
      startRound({
        mark: mark,
        map: data.map,
        done: roundCompleted
      });
    };

    var roundCompleted = function(){
      if(marks.length > 0)
        startNextRound();
      else
        endLevel();
    };

    var endLevel = function(){
      data.done();
    };

    // UI

    models.level.set({
      number: data.levelNum,
      name: data.level.name,
      accumulatedPoints: 0, // sum of points in level achieved
      neededPoints: data.level.points
    });

    $('#startLevel').removeClass('hidden');
    $('#startLevelButton').one('click', function(){
      $('#startLevel').addClass('hidden');
      startNextRound();
    });
  };
  
  //################################### ROUND ##################################
  /*
    data: 
      map: the google map
      done: the callback
      mark: the mark, which should be guessed
  */
  var startRound = function(data){

    var mark = data.mark;
    var startTime = getTime();
    var guessMarker = null;
    var correctMarker = null;
    var interval = null;
    var listener = null;

    // states

    var checkTime = function(){
      var percent = getTimePercent(startTime, maxRoundTime);
      $('#time').css('width', percent + '%');
      if(percent >= 100)
        timeRanOut();
    };

    var addClickListener = function(){
      return google.maps.event.addListener(data.map, 'click', function(event) {
        guessMarker = new google.maps.Marker({
          icon: new google.maps.MarkerImage(
            'img/flag.png',
            new google.maps.Size(20, 32),
            new google.maps.Point(0, 0),
            new google.maps.Point(0, 32)
          ),
          shadow: new google.maps.MarkerImage(
            'img/shadow.png',
            new google.maps.Size(37, 32),
            new google.maps.Point(0, 0),
            new google.maps.Point(0, 32)
          ),
          position: event.latLng, 
          map: data.map,
          title: 'My Guess'
        });
        
        userClicked(event.latLng);
      });
    };

    var userClicked = function(guess){
      var pos = mark.position;
      var markPosition = new google.maps.LatLng(pos.lat, pos.lng);
      var distance = parseInt(getDistance(guess, markPosition));
      var distancePoints = maxDistancePoints * getDistanceReduction(distance);
      var timePercent = getTimePercent(startTime, maxRoundTime);
      var timePoints = maxTimePoints * timePercent / 100;
      var points = parseInt(distancePoints) + parseInt(timePoints);

      models.round.set({
        distance: distance, 
        points: points
      });
      models.level.set({
        accumulatedPoints: models.level.get('accumulatedPoints') + points
      });
      endRound();
    };

    var timeRanOut = function(){
      models.round.set({ points: 0 });
      endRound();
    };

    var endRound = function(){
      // show correct spot
      var pos = mark.position;
      correctMarker = new google.maps.Marker({
        icon: new google.maps.MarkerImage(
          'img/flag2.png',
          new google.maps.Size(20, 32),
          new google.maps.Point(0, 0),
          new google.maps.Point(20, 32)
        ),
        shadow: new google.maps.MarkerImage(
          'img/shadow2.png',
          new google.maps.Size(37, 32),
          new google.maps.Point(0, 0),
          new google.maps.Point(37, 32)
        ),
        position: new google.maps.LatLng(pos.lat, pos.lng), 
        map: data.map,
        title: 'Correct Spot'
      });

      google.maps.event.removeListener(listener);
      window.clearInterval(interval);

      showResult({
        done: function(){
          guessMarker && guessMarker.setMap(null);
          correctMarker && correctMarker.setMap(null);
          data.done();
        }
      });
    };

    // UI

    models.round.set({
      target: mark.name,
      distance: 0,
      points: 0
    });

    // start

    interval = window.setInterval(checkTime, 30);
    listener = addClickListener();
  };
  
  //################################## RESULT ##################################
  /*
    data: 
      mark: the mark, which should be guessed
  */
  var showResult = function(data){

    var startTime = getTime();
    var interval = null;

    // states

    var checkTime = function(){
      var percent = getTimePercent(startTime, maxNextTime);
      $('#resultTime').css('width', percent + '%');
      if(percent >= 100)
        next();
    };

    var next = function(){
      $('#result').addClass('hidden');
      interval && window.clearInterval(interval);
      unbind();
      data.done();
    };

    var pause = function(){
      interval && window.clearInterval(interval);
      interval = undefined;
    };

    var unbind = function(){
      $('#pauseButton').unbind('click', pause);
      $('#nextButton').unbind('click', next);
    };

    var bind = function(){
      $('#pauseButton').bind('click', pause);
      $('#nextButton').bind('click', next);
    };
    
    // UI

    $('#result').removeClass('hidden');

    // start

    interval = window.setInterval(checkTime, 30);
    bind();
  };
  
  //#################################### MAP ###################################

  var createMap = function(){
    var styles = [
      {
        featureType: 'administrative.country',
        elementType: 'all',
        stylers: [
          { hue: '#f600ff' },
          { visibility: 'simplified' },
          { saturation: 98 }
        ]
      }, {
        featureType: 'all',
        elementType: 'labels',
        stylers: [
          { visibility: 'off' }
        ]
      }
    ];

    var map = new google.maps.Map(document.getElementById('map'), {
      zoom: 2,
      center: new google.maps.LatLng(0, 0),
      disableDefaultUI: true,
      mapTypeId: 'borders'
    });
    
    var borderMapType = new google.maps.StyledMapType(styles, {
      name: 'Country Borders'
    });

    map.mapTypes.set('borders', borderMapType);
    map.setMapTypeId('borders');

    return map;
  };

  //############################### DOCUMENT READY #############################

  $(document).ready(function(){
    var map = createMap();

    $('#startGameButton').one('click', function(){
      $('#welcome').addClass('hidden');
      startGame(map, levels);
    });
  });

  //################################# INTERFACE ################################

  var models = {

    round: model({
      target: 'Worldquiz',
      distance: 0,
      points: 0
    }),

    level: model({
      number: 0,
      name: '',
      accumulatedPoints: '-',
      neededPoints: '-'
    })

  };

  return models;

})();