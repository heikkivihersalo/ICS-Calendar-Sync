// ======================
// == GET DEPENDENCIES ==
// ======================
const functions = require("firebase-functions");
const admin = require('firebase-admin');

// ======================
// == IMPORT FUNCTIONS ==
// ======================

const axios = require('./lib/axios.js');
const gCal = require("./lib/gcal.js");
const iCal = require("./lib/ical.js");

// ======================
// ===== VARIABLES ======
// ======================

const CALENDARS = require('./calendars.json');
const TUUDO_URL = "https://tuu.do/?t=x3CScJ6JeZtWG3To";

// ======================
// = FIREBASE FUNCTIONS =
// ======================
/**
 * Sync Calendar Events to Tuudo
 */
exports.syncEventsToTuudo = functions.https.onRequest(async (req, res) => {
    let data = await axios.getData(TUUDO_URL);
    let events = await iCal.parseIcal(data);
    await gCal.createEvents(CALENDARS.tuudo_calendar_id, events, res);
    
    res.end();
});

admin.initializeApp();
