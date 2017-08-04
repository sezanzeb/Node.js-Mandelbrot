var request = require("request");

request("http://localhost:4000/", function(error, response, body) {
  console.log(body);
});
