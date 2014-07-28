// index.js
var express = require("express");
var logfmt = require("logfmt");
var _ = require('underscore');
var app = express();
var port = Number(process.env.PORT || 5000);
var nodeEnv = process.env.NODE_ENV || 'local';
var apiUrl = nodeEnv === 'local' ? 'http://api-staging.eatmorsel.com' : 'http://api.eatmorsel.com';
var siteUrl = 'http://morsel-media.herokuapp.com/morsels/';

app.use(logfmt.requestLogger());

//enable gzip
var compress = require('compression');
app.use(compress());

app.use('/assets', express.static(__dirname + '/assets'));

//use hbs for templates
var hbs = require('hbs');
app.set('view engine', 'hbs');
app.set('views', __dirname + '/views');

app.get('/', function(req, res) {
  res.redirect('http://www.eatmorsel.com');
});

app.get('/morsels/:id', function(req, res){
  var request = require('request');

  request(apiUrl+'/morsels/'+req.params.id+'.json', function (error, response, body) {
    var morsel = JSON.parse(body).data,
        metadata;

    if (!error && response.statusCode == 200) {
      metadata = {
        "title": _.escape(morsel.title + ' - ' + morsel.creator.first_name + ' ' + morsel.creator.last_name),
        "image": getMetadataImage(morsel) || 'http://www.eatmorsel.com/assets/images/logos/morsel-large.png',
        "description": getFirstDescription(morsel.items),
        "twitter": {
          "creator": '@'+(morsel.creator.twitter_username || 'eatmorsel')
        },
        "og": {
          "article_published_at": morsel.published_at,
          "article_modified_at": morsel.updated_at
        },
        "url": siteUrl+morsel.id
      };

      if(morsel.creator.facebook_uid) {
        metadata.og.author = morsel.creator.facebook_uid;
      }

      res.status(200).render('morsel_metadata', {
        nodeEnv: nodeEnv,
        metadata: metadata,
        //this thing gets replaced by something from the API
        returnUrl: 'http://morsel-presskit-test.herokuapp.com/shell/8#'+morsel.id
      });
    } else {
      render404(res);
    }
  });
});

app.get('*', function(req, res){
  render404(res);
});

httpServer = app.listen(port, function() {
  console.log("Listening on " + port);
});

function render404(res) {
  res.status(404).render('404');
}

function getMetadataImage(morsel) {
  var primaryItem;

  //if they have a collage, use it
  if(morsel.photos) {
    if(morsel.photos._800x600) {
      return morsel.photos._800x600;
    } else {
      return morsel.photos._400x300;
    }
  } else {
    //use their cover photo as backup
    primaryItem = _.find(morsel.items, function(i) {
      return i.id === morsel.primary_item_id;
    });

    if(primaryItem && primaryItem.photos) {
      return primaryItem.photos._992x992;
    } else {
      return morsel.items[0].photos._992x992;
    }
  }
}

function getFirstDescription(items) {
  var firstItemWithDescription;

  firstItemWithDescription = _.find(items, function(m) {
    return m.description && m.description.length > 0;
  });

  if(firstItemWithDescription) {
    return firstItemWithDescription.description;
  } else {
    return '';
  }
}