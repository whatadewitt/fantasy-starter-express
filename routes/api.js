/* If working with a SPA, you can use the /api/ endpoint to map endpoints directly to the Yahoo! API */

const express = require("express");
const router = express.Router();
const async = require("async");
const request = require("request");

const User = require("../lib/schema/user");

const cache = {};

const returnError = (msg, res, err) => {
  return res.json({
    message: msg,
    error: err
  });
};

// helper function that will refresh token if it's expired (most of the time)
const makeAPICall = (req, resource, subresource, ...args) => {
  const callback = args.pop();

  const cb = (err, data) => {
    if (err) {
      let reason = String(err.description)
        .match(/"(.*?)"/)
        .shift();

      if (reason && '"token_expired"' === reason) {
        var options = {
          url: "https://api.login.yahoo.com/oauth2/get_token",
          method: "post",
          json: true,
          form: {
            client_id: process.env.APP_KEY || require("../conf.js").APP_KEY,
            client_secret:
              process.env.APP_SECRET || require("../conf.js").APP_SECRET,
            redirect_uri: "oob",
            refresh_token: req.user.refresh_token,
            grant_type: "refresh_token"
          }
        };

        request(options, function(error, response, body) {
          if (error) {
            return callback("Couldn't renew token...");
          }

          User.findOne({ guid: body.xoauth_yahoo_guid }, (err, user) => {
            if (err) {
              return callback("Couldn't find user.");
            }

            if (user) {
              req.app.yf.setUserToken(body.access_token);

              req.user.access_token = body.access_token;
              req.user.refresh_token = body.refresh_token;

              User.update(
                { _id: user._id },
                {
                  access_token: body.access_token,
                  refresh_token: body.refresh_token
                },
                (err, updatedUser) => {
                  if (err) {
                    return callback("Error updating user.");
                  }

                  // re-try the request
                  // reset the args to have the proper callback
                  args.pop();
                  args.push(callback);

                  return makeAPICall(req, resource, subresource, ...args);
                }
              );
            }
          });
        });
      } else {
        return callback(reason);
      }
    } else {
      return callback(null, data);
    }
  };

  args.push(cb);
  return req.app.yf[resource][subresource].apply(req.app.yf[resource], args);
};

// Sample call
// get all fantasy bnaseball leagues that the current user plays in
router.get("/user/leagues", (req, res, next) => {
  makeAPICall(req, "user", "game_leagues", "mlb", (err, data) => {
    if (err) {
      return returnError("error retrieving user games", res, err);
    }

    let { games } = data;
    leagues = games[0].leagues;

    return res.json({
      user: {
        name: req.user.nickname,
        avatar: req.user.avatar
      },
      leagues
    });
  });
});

module.exports = router;
