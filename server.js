const express = require("express");
const cors = require("cors"); 
const useragent = require("express-useragent");
const geoip = require("geoip-lite"); 

const app = express();

app.use(cors());

app.use(useragent.express());

app.get("/", async (req, res) =>  {


});

app.listen(5000, () => console.log("Server 5000 portunda işləyir..."));