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

const TUUDO_URL = CALENDARS.webcal.tuudo;
const GOOGLE_CALENDAR_ID_TUUDO = CALENDARS.google.tuudo;

// ======================
// = FIREBASE FUNCTIONS =
// ======================
/**
 * Sync Tuudo events to Google Calendar
 */
exports.syncEventsToTuudo = functions.pubsub.schedule('0 0 * * *').onRun(async (context) => {
    let data = await axios.getData(TUUDO_URL);
    let events = await iCal.parseIcal(data);
    await gCal.createEvents(GOOGLE_CALENDAR_ID_TUUDO, events);
    
    return null;
});

admin.initializeApp();
