var maxWorkers = process.env.MAX_WORKERS || 1,
    cluster = require('cluster'),
    numCPUs = require('os').cpus().length,
    workers = numCPUs >= maxWorkers ? maxWorkers : numCPUs,
    Logger = {},
    index = 0;

//this whole thing is copied from morsel-web. documented there and will need to be updated eventually
if (cluster.isMaster && ((process.env.NODE_ENV || 'local') !== 'local')) {
  cluster.on('exit', function (worker, code, signal) {
    if (code !== 130) {
      cluster.fork();
    }
  });

  process.on('SIGINT', function () {
    cluster.disconnect(function () {
      process.exit(1);
    });
  });

  for (index = 0; index < workers; index += 1) {
    cluster.fork();
  }

} else {
  var serverDomain = require('domain').create(),
      httpServer,
      rollbar;

  serverDomain.on('error', function (err) {
    var exceptionNotifyer = {},
        killtimer = setTimeout(function () {
           process.exit(1);
        }, 5000);

    killtimer.unref();
    try {
      if (rollbar) {
        rollbar.shutdown();
      }
      if (httpServer) {
        httpServer._connections = 0;
        httpServer.close(function () {
           cluster.worker.disconnect();
        });
      } else if (cluster.worker) {
        cluster.worker.disconnect();
      }
      console.log('Unhandled Exception in domain of cluster worker ' + process.pid);
      console.log(err.stack || err);
    } catch(er2) {

    }
  });

  serverDomain.run(function () {
    var config;
    try{
      config = require('./config');
      console.log('Config loaded');
    } catch(err) {
      console.log('Config not loaded');
    }
    var rollbarAccountKey = process.env.ROLLBAR_ACCOUNT_KEY || config.rollbarAccountKey;
    var nodeEnv = process.env.NODE_ENV || config.node_env || 'local';

    // rollbar should be the first require
    if (rollbarAccountKey) {
      rollbar = require('rollbar');
      rollbar.handleUncaughtExceptions(rollbarAccountKey, {
        environment: nodeEnv
      });
    }

    var express = require("express");
    var logfmt = require("logfmt");
    var _ = require('underscore');
    var app = express();
    var port = Number(process.env.PORT || 5000);
    var apiUrl = 'http://api.eatmorsel.com';//always use prod for this, shouldn't need staging
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
            metadata,
            widgetMorselUrl;

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

          //is there a proper widget url to forward to?
          if(morsel.place && morsel.place.widget_url) {
            widgetMorselUrl = morsel.place.widget_url+'#'+encodeURIComponent('mrsltype=morsel&mrslid='+morsel.id);
          } else {
            //no - just send them to www.eatmorsel.com
            widgetMorselUrl = morsel.url;
          }

          res.status(200).render('morsel_metadata', {
            nodeEnv: nodeEnv,
            metadata: metadata,
            returnUrl: widgetMorselUrl
          });
        } else {
          render404(res);
        }
      });
    });

    app.get('/robots.txt', function(req, res){
      res.sendfile('robots.txt');
    });

    app.get('*', function(req, res){
      render404(res);
    });

    if(rollbar) {
      app.use(rollbar.errorHandler(rollbarAccountKey, {
        environment: nodeEnv
      }));
    }

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
  });
}