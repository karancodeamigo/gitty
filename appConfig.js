const express = require('express');
const bodyParser = require('body-parser');

function setupExpressApp() {
    const app = express();
    app.use(bodyParser.json());
    return app;
}

module.exports = {
    setupExpressApp
};
