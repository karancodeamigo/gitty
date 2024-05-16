
function getTimestamp() {
    const date = new Date();
    // Formats the date as 'YYYYMMDD-HHMMSS'
    return date.toISOString().replace(/T/, '-').replace(/\..+/, '').replace(/:/g, '');
}

module.exports = {
    getTimestamp
};
