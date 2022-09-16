const path = require('path');
const { warn, log, error } = require("firebase-functions/lib/logger");
const { google } = require('googleapis');
const credentials = require('./jwt.keys.json');

const SCOPES = 'https://www.googleapis.com/auth/calendar';
const TIME_ZONE = 'GMT-05:00';
const KEY_FILE_PATH = path.join(__dirname, 'jwt.keys.json');
const GOOGLE_PRIVATE_KEY = credentials.private_key;
const GOOGLE_CLIENT_EMAIL = credentials.client_email;
const GOOGLE_PROJECT_NUMBER = "360636905446";
const GOOGLE_CALENDAR_ID = "c_he0ldssjtiiidpecps9of63qfc@group.calendar.google.com";
const ERROR_RESPONSE = {
    status: "500",
    message: "There was an error adding an event to your Google Calendar"
}

/**
 * Initialize Google Calendar API client
 */
const calendar = google.calendar({
    version: 'v3',
    project: GOOGLE_PROJECT_NUMBER,
    auth: new google.auth.JWT(
        GOOGLE_CLIENT_EMAIL,
        null,
        GOOGLE_PRIVATE_KEY,
        SCOPES
    )
});


/**
 * Search for duplicate events
 * TODO: Filtering with date is not working properly. Figure out if it is truly needed.
 * @param {object} newEventData Individual event object containing event details
 * @param {object} gCalEvents All current Google Calendar events
 * @returns {object} Object containing search details
 */
const searchEvent = async (newEventData, gCalEvents) => {
    // Check for full match
    for await (let current of gCalEvents.data.items) {
        if (
            current.summary == newEventData.eventName &&
            current.description == newEventData.description &&
            // Date.parse(current.start.dateTime) == Date.parse(newEventData.startTime) &&
            // Date.parse(current.end.dateTime) == Date.parse(newEventData.endTime) &&
            current.location == newEventData.location
        ) {
            const object = {
                'type': 'skip',
                'event_id': current.id
            }

            return object

        }

    };

    // Check for partial match
    for await (let current of gCalEvents.data.items) {
        if (current.summary == newEventData.eventName &&
            current.description == newEventData.description) {
            let object = {
                'type': 'update',
                'event_id': current.id
            }

            return object
        }
    }

    return {
        'type': 'create',
        'event_id': null
    };
}

/**
 * Add calendar event
 * @param {object} event Individual event object containing event details
 * @param {string} auth Authorization credentials
 * @returns {Promise} 
 */
const addEvent = async (newEventData, gCalEvents, gAuth) => {
    return new Promise((resolve, reject) => {
        gAuth.getClient().then(async (auth) => {
            // Build event data
            const eventData = {
                auth: auth,
                calendarId: GOOGLE_CALENDAR_ID,
                resource: {
                    'summary': newEventData.eventName,
                    'description': newEventData.description,
                    'start': {
                        'dateTime': new Date(newEventData.startTime),
                        'timeZone': TIME_ZONE
                    },
                    'end': {
                        'dateTime': new Date(newEventData.endTime),
                        'timeZone': TIME_ZONE
                    },
                    'location': newEventData.location
                }
            };

            // Check for current calendar events
            const result = await searchEvent(newEventData, gCalEvents);

            console.log(result);

            // Create, update or skip calendar event creation
            if (result === undefined || result.type == 'create') {
                calendar.events.insert(eventData, (err, res) => {
                    if (err) {
                        error(`CREATE: There was an error creating event: ${err}`);
                        reject(err)
                    } else {
                        log(`CREATE: Event created succesfully`);
                        resolve(res);
                    };
                });
            }

            if (result !== undefined && result.type == 'update') {
                calendar.events.update({
                    auth: auth,
                    calendarId: GOOGLE_CALENDAR_ID,
                    eventId: result.event_id,
                    resource: {
                        ...eventData.resource
                    }
                }, (err, res) => {
                    if (err) {
                        error(`UPDATE: There was an error updating event ${result.event_id}: ${err}`);
                        reject(err)
                    } else {
                        log(`UPDATE: Event ${result.event_id} updated succesfully`);
                        resolve(res);
                    };
                });
            }

            if (result !== undefined && result.type == 'skip') resolve('Event already created');
        });
    });
}

/**
 * Search for events that are in Google Calendard but no longer exist in iCal stream
 * TODO: Search for deleted events doesn't work properly. 
 * Propably needs some delay between deleting and syncing new events
 * @param {*} iCalEvents 
 * @param {*} gCalEvents 
 * @param {*} gAuth 
 * @returns {Promise}
 */
const deleteEvents = async (iCalEvents, gCalEvents, gAuth) => {
    return new Promise((resolve, reject) => {
        gAuth.getClient().then((auth) => {
            for (let k in iCalEvents) {
                if (iCalEvents.hasOwnProperty(k)) {
                    const iCalEvent = iCalEvents[k];
                    if (iCalEvents[k].type != 'VEVENT') continue;
                    for (let gCalEvent of gCalEvents.data.items) {
                        if (
                            gCalEvent.summary == iCalEvent.summary &&
                            gCalEvent.description == iCalEvent.description &&
                            Date.parse(gCalEvent.start.dateTime) == Date.parse(iCalEvent.startTime) &&
                            Date.parse(gCalEvent.end.dateTime) == Date.parse(iCalEvent.endTime)
                        ) {
                            calendar.events.delete({
                                auth: auth,
                                calendarId: GOOGLE_CALENDAR_ID,
                                eventId: gCalEvent.eventId,
                            });
                        }
                    }
                }
            }
        });
        resolve();
    });
}

/**
 * Create calendar events to Google Calendar
 * @param {object} events Calendar events fetched from API
 * @param {object} response Response to the server
 */
module.exports.createEvents = async function (iCalEvents, response) {
    try {
        // Handle authentication
        const gAuth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });

        // Get all current events from calendar
        const gCalEvents = await calendar.events.list({
            auth: gAuth,
            calendarId: GOOGLE_CALENDAR_ID
        });

        /**
         * TODO: Search for deleted events doesn't work properly. 
         * Propably needs some delay between deleting and syncing new events
         */
        // Delete deleted events from calendar
        // await deleteEvents(iCalEvents, gCalEvents, gAuth);

        // Sync new events or update old ones
        const eventLog = [];
        for (let k in iCalEvents) {
            if (iCalEvents.hasOwnProperty(k)) {
                const ev = iCalEvents[k];
                if (iCalEvents[k].type != 'VEVENT') continue;
                const newEventData = {
                    eventName: ev.summary,
                    description: ev.description,
                    startTime: ev.start,
                    endTime: ev.end,
                    location: ev.location
                }

                await addEvent(newEventData, gCalEvents, gAuth).then(data => {
                    eventLog.push(data);
                }).catch(err => {
                    error('Error adding event: ' + err.message);
                });
            }
        }
        log('Events synced succesfully');
        response.status(200).send(eventLog);
    } catch (err) {
        error('Error syncing events: ' + err.message);
        response.status(500).send(ERROR_RESPONSE);
    }
}
