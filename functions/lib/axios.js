const axios = require('axios');

module.exports.getData = async function (url) {
    const config = {
        method: 'get',
        url: url
    }

    let res = await axios(config)
    return res.data;
}
