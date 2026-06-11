const path = require("path");

let configViewEngine = (app) => {
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "..", "src", "views"));
};

module.exports = configViewEngine;
