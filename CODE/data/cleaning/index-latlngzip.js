const ALL_ZIP_CODES = {};
const GEOJSON_FILE = "static/nyc-zip-code-tabulation-areas-polygons.geojson";
let GEOJSON_LAYER = null;
let ZIP_CODES_TO_COLOR = {};
let COLOR_SCALE = d3.scaleLinear().domain([1, 100]).range(["white", "blue"]);

const INITIAL_LAT_LONG = [40.69, -73.8827],
    INITIAL_ZOOM = 10,
    MAX_ZOOM = 19,
    MIN_ZOOM = 10;
const GEOJSON_STYLE = {
    "weight": 1.5,
    "opacity": 0.2,
    "fillColor": "#000000"
};
const map = L.map('map').setView(INITIAL_LAT_LONG, INITIAL_ZOOM);

const MAX_FILES = 0;
const STRING_PREFIX = 'split-';

const START_FILE = 0;

async function main() {
    try {
        L.tileLayer(
            'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
            { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }
        ).addTo(map);

        const response = await fetch(GEOJSON_FILE);
        const data = await response.json();
        GEOJSON_LAYER = new L.GeoJSON(data, { onEachFeature, style: GEOJSON_STYLE });
        GEOJSON_LAYER.addTo(map);

        var GJ = L.geoJson(data);
        for (let i = START_FILE; i < MAX_FILES; i++) {
            let zeroFilled = ('000' + i).substr(-3);

            const res = await fetch('/static/inout/' + STRING_PREFIX + zeroFilled + '.csv');
            const csvText = await res.text();

            var LAT_LONGS = d3.csvParseRows(csvText).map(row => {
                return [row[4], row[5]];
            });

            var final = [];
            LAT_LONGS.forEach(latLong => {
                const a = leafletPip.pointInLayer(L.marker(latLong).getLatLng(), GJ);
                var result;

                if (a.length === 0 || a[0].feature == null) {
                    result = "null";
                } else {
                    result = a[0].feature.properties.postalCode;
                }

                final.push([...latLong, result]);
            });

            let csv = '';
            final.forEach(r => { csv = csv.concat(r.join(', ')).concat("\n") });

            var hiddenElement = document.createElement('a');
            hiddenElement.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
            hiddenElement.target = '_blank';

            // provide the name for the CSV file to be downloaded
            hiddenElement.download = STRING_PREFIX + zeroFilled + '.csv';
            hiddenElement.click();

            console.log('Done with ', zeroFilled);
        };


        $('.input-tab').show();
        $('.results-tab').hide();

        $('.submit-btn').click((e) => {
            handleFormSubmit(e, Object.keys(ALL_ZIP_CODES));
        });
    } catch (e) {
        console.log(e);
    }

}

function onEachFeature(feature, layer) {
    ALL_ZIP_CODES[feature.properties.postalCode] = feature.properties;

    // console.log('10037', a.getLatLng())
    var m1 = L.polygon(feature.geometry.coordinates).addTo(map);
    layer.on('click', (_e) => {
        console.log(feature);
    })

    layer.on('mouseover', (e) => {
        const { postalCode, PO_NAME, borough } = feature.properties;
        if (postalCode in ZIP_CODES_TO_COLOR) {
            L.popup()
                .setLatLng(e.latlng)
                .setContent("<strong>Postal Code: </strong>" + postalCode
                    + "<br/><strong>Neighborhood: </strong>" + PO_NAME
                    + "<br/><strong>Borough: </strong>" + borough
                    + "<br/><strong>Total Score: </strong>"
                    + ZIP_CODES_TO_COLOR[postalCode])
                .openOn(map);
        } else {
            console.log("Submit the form in sidebar first");
        }
    });
}

function style(feature) {
    const postalCode = feature.properties.postalCode;
    if (postalCode in ZIP_CODES_TO_COLOR) {
        return {
            "weight": 1.5,
            "opacity": 0.4,
            "fillColor": COLOR_SCALE(ZIP_CODES_TO_COLOR[postalCode])
        }
    }

    return {
        "weight": 1.5,
        "opacity": 0.4,
        "fillColor": "#000000"
    }
}

function handleFormSubmit(e, zips) {
    e.preventDefault();

    fetch("/random", {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ zips })
    })
        .then(response => response.json())
        .then(json => {
            ZIP_CODES_TO_COLOR = json;
            GEOJSON_LAYER.setStyle(style);

            writeResults();
        })
        .catch(ex => console.log(ex))
}

function writeResults() {
    $('#results').html('');
    console.log(sortDictByValue(ZIP_CODES_TO_COLOR).slice(0, 5));
    const sortedKeys = sortDictByValue(ZIP_CODES_TO_COLOR).slice(0, 5).map(key => {
        console.log(key);
        $(`<li class="list-group-item">${key}</li>`).appendTo('#results');
    });
}

function switchToInputTab(e) {
    switchTab(e, 'results', 'input');
}

function switchToResultsTab(e) {
    switchTab(e, 'input', 'results');
}

function switchTab(e, currentTab, otherTab) {
    e.preventDefault();

    var target = e.target;
    var parent = $(target).parent();
    if (parent.hasClass('active')) {
        return;
    }

    $('.active').removeClass('active');
    parent.addClass('active');
    var otherTabObj = $(`.${otherTab}-tab`);
    otherTabObj.show();

    var currentTabObj = $(`.${currentTab}-tab`);
    currentTabObj.hide();

    $(`.${otherTab}-tab-link`).addClass('active');
}

function sortDictByValue(dict) {
    const items = Object.keys(dict).map(
        (key) => { return [key, dict[key]] });

    items.sort(
        (first, second) => { return first[1] - second[1] }
    );

    const keys = items.map(
        (e) => { return e[0] });

    return keys;
}

main();