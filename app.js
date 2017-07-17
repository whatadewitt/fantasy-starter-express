const express = require("express");
const path = require("path");
const favicon = require("serve-favicon");
const logger = require("morgan");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const session = require("express-session");

const APP_KEY = process.env.APP_KEY || require("./conf.js").APP_KEY;
const APP_SECRET = process.env.APP_SECRET || require("./conf.js").APP_SECRET;

const passport = require("passport");
const request = require("request");
const OAuth2Strategy = require("passport-oauth2");
const YahooFantasy = require("yahoo-fantasy");
const RedisStore = require("connect-redis")(session);
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGOHQ_URL || require("./conf.js").MONGO_DB, {
  useMongoClient: true
});

const User = require("./lib/schema/user");

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
  console.log("Connected to Mongo!");
});

const index = require("./routes/index");

const REDIS_URL = process.env.REDIS_URL
  ? process.env.REDIS_URL
  : require("./conf.js").REDIS_URL;

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(
  new OAuth2Strategy(
    {
      authorizationURL: "https://api.login.yahoo.com/oauth2/request_auth",
      tokenURL: "https://api.login.yahoo.com/oauth2/get_token",
      clientID: APP_KEY,
      clientSecret: APP_SECRET,
      callbackURL:
        (process.env.APP_URL || require("./conf.js").APP_URL) +
        "/auth/yahoo/callback"
    },
    function(accessToken, refreshToken, params, profile, done) {
      const options = {
        url:
          "https://social.yahooapis.com/v1/user/" +
          params.xoauth_yahoo_guid +
          "/profile?format=json",
        method: "get",
        json: true,
        auth: {
          bearer: accessToken
        }
      };

      request(options, (error, response, body) => {
        if (!error && response.statusCode == 200) {
          const userObj = {
            guid: body.profile.guid,
            nickname: body.profile.nickname,
            avatar: body.profile.image.imageUrl,
            access_token: accessToken,
            refresh_token: refreshToken
          };

          return loginUser(userObj, done);
        }
      });
    }
  )
);

function loginUser(userObj, done) {
  User.findOne({ guid: userObj.guid }, (err, user) => {
    if (err) return done(err, null);

    if (user) {
      app.yf.setUserToken(userObj.access_token);
      return done(null, user);
    }

    new User(
      Object.assign(userObj, { created_at: new Date() })
    ).save((err, user) => {
      if (err) return done(err, null);

      return loginUser(userObj, done);
    });
  });
}

const app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.yf = new YahooFantasy(APP_KEY, APP_SECRET);
app.db = db;

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
  session({
    secret: require("./conf.js").SESSION_SECRET || "dj kitty",
    resave: true,
    saveUninitialized: true,
    maxAge: 3600000,
    store: new RedisStore({
      port: process.env.REDIS_PORT || require("./conf.js").REDIS_PORT,
      host: process.env.REDIS_HOST || require("./conf.js").REDIS_HOST,
      logErrors: true
    })
  })
);
app.use(express.static(path.join(__dirname, "public")));
app.use(passport.initialize());
app.use(passport.session());

app.get("/login", (req, res) => {
  res.render("login", { title: "Please Login" });
});

app.get(
  "/auth/yahoo",
  passport.authenticate("oauth2", {
    successRedirect: "/",
    failureRedirect: "/login"
  }),
  (req, res, user) => {
    res.redirect("/");
  }
);

app.get(
  "/auth/yahoo/callback",
  passport.authenticate("oauth2", { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect(req.session.redirect || "/");
  }
);

app.get("/logout", (req, res) => {
  req.logout();

  return res.redirect("/login");
});

app.use("/", checkAuth, index);

function checkAuth(req, res, next) {
  let userObj;

  if (req.isAuthenticated()) {
    req.userObj = {
      name: req.user.name,
      avatar: req.user.avatar
    };

    return next();
  } else {
    userObj = null;
    return res.redirect("/login");
  }
}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
