const ALL_ZIP_CODES = {};
const GEOJSON_FILE = "static/nyc-zip-code-polygons.geojson";
const INITIAL_LAT_LONG = [40.69, -73.8827],
    INITIAL_ZOOM = 10,
    MAX_ZOOM = 19,
    MIN_ZOOM = 10;
const DEFAULT_GEOJSON_STYLE = {
    // "color": "black",
    "weight": 1.5,
    "opacity": 0.2,
    "fillColor": "#FFFFFF",
    "fillOpacity": 0.8,
};
const HIGHLIGHTED_GEOJSON_STYLE = {
    // 'color': 'black',
    'fillColor': 'yellow',
    'weight': 2,
    'opacity': 1,
    'fillOpacity': 0.8,
};
const ARR = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const PERCENTILE_INC = 0.125;
const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    // maximumFractionDigits: 0, // (causes 2500.99 to be printed as $2,501)
});

const map = L.map('map').setView(INITIAL_LAT_LONG, INITIAL_ZOOM);

let GEOJSON_LAYER = null;
let COLOR_SCALE = null;
let RESULTS = [];
let DISTRIBUTIONS = {};
let IS_LOADING_COMPLETE = false;
let CURRENT_ZIP_CODE = null;

async function main() {
    L.tileLayer(
        'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
        { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }
    ).addTo(map);

    const response = await fetch(GEOJSON_FILE);
    const data = await response.json();

    GEOJSON_LAYER = new L.GeoJSON(data, { onEachFeature, style: DEFAULT_GEOJSON_STYLE });
    GEOJSON_LAYER.addTo(map);

    hideBottomCharts();

    $('.submit-btn').click((e) => {
        handleFormSubmit(e);
    });

    setupPriceRangeInputSlider();
    toggleViews(true);
}

function onEachFeature(feature, layer) {
    ALL_ZIP_CODES[feature.properties.postalCode] = [feature.properties, layer];

    let popup;
    layer.on('click', (e) => {
        const { postalCode } = feature.properties;
        GEOJSON_LAYER.setStyle(style);

        if (postalCode == CURRENT_ZIP_CODE) {
            CURRENT_ZIP_CODE = null;
            hideBottomCharts();
        } else {
            chartPercentiles(postalCode);
            generateChart(postalCode);
            generateIncidentsChart(postalCode);
            generateScatterPlot(postalCode);
            generateLink(postalCode);

            layer.setStyle(HIGHLIGHTED_GEOJSON_STYLE);
            CURRENT_ZIP_CODE = postalCode;

            $("#incidents_chart").get(0).scrollIntoView();
        }
    });

    layer.on('mouseover', (e) => {
        const { postalCode, PO_NAME, borough } = feature.properties;
        const result = RESULTS.find(result => result.zip_code == postalCode);
        if (result) {
            popup = L.popup()
                .setLatLng(e.latlng)
                .setContent("<strong>Postal Code: </strong>" + postalCode
                    + "<br/><strong>Neighborhood: </strong>" + PO_NAME
                    + "<br/><strong>Borough: </strong>" + borough
                    + "<br/><strong>Total Score: </strong>"
                    + RESULTS.find(result => result.zip_code == postalCode).total_score)
                .openOn(map);
        } else {
            L.popup()
                .setLatLng(e.latlng)
                .setContent("<strong>Postal Code: </strong>" + postalCode
                    + "<br/><strong>Neighborhood: </strong>" + PO_NAME
                    + "<br/><strong>Borough: </strong>" + borough
                    + "<br/>Data not available!")
                .openOn(map);
        }
    });

    layer.on('mouseout', (e) => {
        map.closePopup(popup);
        popup = null;
    })
}

function style(feature) {
    const postalCode = feature.properties.postalCode;
    const result = RESULTS.find(result => result.zip_code == postalCode);
    if (result) {
        return {
            "weight": 1.2,
            "opacity": 1,
            "fillColor": COLOR_SCALE(result.total_score),
            "fillOpacity": 1,
        }
    }

    return { ...DEFAULT_GEOJSON_STYLE, fillColor: 'grey' };
}

function handleFormSubmit(e) {
    e.preventDefault();
    toggleViews(false);

    hideBottomCharts();

    const inputs = ['#accessibility_input', '#safety_input', '#affordability_input'];

    let [accessibilityPref, safetyPref, affordabilityPref] = inputs.map(
        input => Number.parseFloat($(input).val())
    ).map(inputVal => Number.isNaN(inputVal) ? 0 : inputVal);

    // if all preference inputs are zero
    if (accessibilityPref + safetyPref + affordabilityPref == 0) {
        // assign equal weights
        accessibilityPref = safetyPref = affordabilityPref = 100;
    }

    const input = {
        "preferences": {
            "accessibility": accessibilityPref,
            "safety": safetyPref,
            "affordability": affordabilityPref
        },
        "price_range_filter": {
            "low": $('#fromSlider').val(),
            "high": $('#toSlider').val()
        }
    }

    fetch("/calculate", {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
    })
        .then(response => response.json())
        .then(json => {
            writeResults(json);
            toggleViews(true);

            GEOJSON_LAYER.setStyle(style);
        })
        .catch(ex => console.log(ex))
}

function writeResults(output) {
    $('.results-tab').show();
    $('#results_body').html('');

    RESULTS = output.results;
    DISTRIBUTIONS = output.distributions;

    COLOR_SCALE = d3.scaleQuantile()
        .range(d3.schemeBlues[ARR.length])
        .domain(RESULTS.map(result => result.total_score));

    const top10Zips = RESULTS.slice(0, 10);
    top10Zips.map(key => {
        $(`
            <tr class="result_row" style="cursor: pointer">
                <td><a class="result-class" data-zip="${key.zip_code}">${key.zip_code}</a></td>
                <td><a class="result-class" data-zip="${key.zip_code}">${key.total_score}</a></td>
            </tr>
        `).appendTo("#results_body");
    });

    $('.result_row').click(function (e) {
        e.preventDefault();
        const zip_code = $(this).find('td:first').text();
        handleRowClick(zip_code);
    });

    $('.result-class').click(function (e) {
        e.stopPropogation();
        const zip_code = $(this).data('zip') + "";
        handleRowClick(zip_code);
    });

    function handleRowClick(zip_code) {
        const result = RESULTS.find(result => result.zip_code == zip_code);

        if (result) {
            GEOJSON_LAYER.setStyle(style);
            if (zip_code == CURRENT_ZIP_CODE) {
                CURRENT_ZIP_CODE = null;
                hideBottomCharts();
            } else {
                CURRENT_ZIP_CODE = zip_code;

                if (zip_code in ALL_ZIP_CODES) {
                    ALL_ZIP_CODES[zip_code][1].setStyle(HIGHLIGHTED_GEOJSON_STYLE);
                }

                chartPercentiles(zip_code);
                generateChart(zip_code);
                generateIncidentsChart(zip_code);
                generateScatterPlot(zip_code);
                generateLink(zip_code);

                $("#incidents_chart").get(0).scrollIntoView();
                map.fitBounds();
            }

        }
    }

    generateLegend();
    // generateScatterPlot();
}

function toggleViews(isLoadngCompleted = false) {
    if (isLoadngCompleted) {
        $('#container').show();
        $('#spinner').hide();
    } else {
        $('#container').hide();
        $('#spinner').show();
    }
}

function chartPercentiles(postalCode) {
    const result = RESULTS.find(result => result.zip_code == postalCode);
    if (result) {
        $('.percentile_squares').show();
        $('#percentile_scores_title').show();
        $('#percentile_scores_title').html('Percentile Scores for ZIP Code ' + postalCode);

        $('#percentile_squares_1').val(result.affordability.percentile);
        $('#percentile_squares_2').val(result.accessibility.percentile);
        $('#percentile_squares_3').val(result.safety.percentile);
        $('#percentile_squares_4').val(result.median_income.percentile);

        $('#percentile_squares_1').attr('title', 'Percentile: ' + result.affordability.percentile + '%');
        $('#percentile_squares_2').attr('title', 'Percentile: ' + result.accessibility.percentile + '%');
        $('#percentile_squares_3').attr('title', 'Percentile: ' + result.safety.percentile + '%');
        $('#percentile_squares_4').attr('title', 'Percentile: ' + result.median_income.percentile + '%');

        $('#percentile_squares_1_min').text('$' + DISTRIBUTIONS.Price_per_sqft.min);
        $('#percentile_squares_2_min').text(DISTRIBUTIONS.accessibility.min);
        $('#percentile_squares_3_min').text(DISTRIBUTIONS.crime_rate.min);
        $('#percentile_squares_4_min').text(CURRENCY_FORMATTER.format(DISTRIBUTIONS.median_income.min));

        $('#percentile_squares_1_max').text('$' + DISTRIBUTIONS.Price_per_sqft.max);
        $('#percentile_squares_2_max').text(DISTRIBUTIONS.accessibility.max);
        $('#percentile_squares_3_max').html(DISTRIBUTIONS.crime_rate.max);
        $('#percentile_squares_4_max').html(CURRENCY_FORMATTER.format(DISTRIBUTIONS.median_income.max));

        $('#percentile_squares_1_val').text('$' + result.affordability.score);
        $('#percentile_squares_2_val').text(result.accessibility.score);
        $('#percentile_squares_3_val').text(result.safety.score);
        $('#percentile_squares_4_val').text(CURRENCY_FORMATTER.format(result.median_income.score));
    }
}

function generateLink(postalCode) {
    const link = `https://zillow.com/homes/${postalCode}_rb`;
    $('#search_link').text("Current Zillow Homes Listings for ZIP Code " + postalCode);
    $('#search_link').attr('href', link);


    $('#search_link').show();
}

function generateChart(postalCode) {
    const bounds = d3.select("#abc").node().getBoundingClientRect();
    const width = bounds.width, height = width / 3.5, marginTop = 50, marginLeft = 80;
    const result = RESULTS.find(result => result.zip_code == postalCode);

    if (result) {
        $('#housing_price_chart_title').show();
        $('#housing_price_chart_title').html('Housing Prices Distribution Chart for ZIP Code ' + postalCode);
        $('#price_distribution_chart').show();
        $("#price_distribution_chart").html('');

        const svg = d3.select("#price_distribution_chart")
            .append("svg")
            .attr("width", width + marginLeft)
            .attr("height", height + marginTop)
            .append("g")
            .attr("transform", `translate(${marginLeft * 0.75})`);

        const priceChartData = result.price_chart_data;

        const xScale = d3.scaleLinear().range([marginLeft, width - marginLeft]),
            yScale = d3.scaleBand().range([height, 0]).padding(0.2);

        xScale.domain([0, d3.max(priceChartData.map(data => data.count))]);
        yScale.domain(priceChartData.map(data => data.label))

        const xAxis = g => g.attr('transform', `translate(0, ${height})`)
            .call(d3.axisBottom().scale(xScale));

        const yAxis = g => g.attr('transform', `translate(${marginLeft}, 0)`)
            .call(d3.axisLeft().scale(yScale));

        const xAxisGrid = d3.axisBottom(xScale).tickSize(-height)
            .tickFormat('').tickValues(xScale.ticks());
        svg.append("g")
            .attr('transform', `translate(0, ${height})`)
            .call(xAxisGrid)
            .style("stroke", "#D2D9E5");

        svg.append("g").attr("id", "bars")
            .selectAll(".bar")
            .data(priceChartData)
            .enter()
            .append("rect")
            .attr("x", xScale(0))
            .attr("y", d => yScale(d.label))
            .attr("width", d => xScale(d.count) - marginLeft)
            .attr("height", yScale.bandwidth())
            .attr("fill", "#6baed6")

        svg.append("g").attr("id", "values")
            .selectAll(".value")
            .data(priceChartData)
            .enter()
            .append("text")
            .attr("x", d => xScale(d.count) - 25 > marginLeft ? xScale(d.count) - 25 : xScale(d.count) + 5)
            .attr("y", d => yScale(d.label) + yScale.bandwidth() / 2 + 5)
            .attr("font-size", 14)
            .text(d => d.count != 0 ? d.count : null);

        svg.append("g")
            .style("font-size", "12px")
            .call(xAxis);

        svg.append("g")
            .style("font-size", "12px")
            .call(yAxis)
            .selectAll("text");

        svg.append("text")
            .attr("id", "x_axis_label")
            .attr("font-size", 15)
            .attr("font-family", "sans-serif")
            .attr("x", width / 2)
            .attr("y", height + 40)
            .attr("text-anchor", "middle")
            .text("Homes per price range")
            .style({ 'stroke-width': '2px', 'fill': 'black' });

        svg.append("text")
            .attr("id", "y_axis_label")
            .attr("font-size", 15)
            .attr("font-family", "sans-serif")
            .attr("x", -marginTop * 3)
            .attr("y", -40)
            .attr("text-anchor", "middle")
            .text("Price ranges")
            .attr("transform", "rotate(-90)");
    }
}

function generateScatterPlot(postalCode) {
    const bounds = d3.select("#abc").node().getBoundingClientRect();
    const width = bounds.width, height = width / 3.5;
    const marginTop = 60, marginLeft = 80;
    const result = RESULTS.find(result => result.zip_code == postalCode);

    $('#scatter_distribution_chart_title').show();
    $('#scatter_distribution_chart_title').html('Housing Prices vs Median Income Scatter Plot for ZIP Code ' + postalCode);
    $('#scatter_distribution_chart').show();
    $("#scatter_distribution_chart").html('');

    const svg = d3.select("#scatter_distribution_chart")
        .append("svg")
        .attr("width", width + marginLeft)
        .attr("height", height + marginTop)
        .append("g")
        .attr("transform", `translate(${marginLeft * 0.75})`);

    const { max } = DISTRIBUTIONS.median_income;
    const xScale = d3.scaleLinear().range([marginLeft, width - marginLeft]),
        yScale = d3.scaleLinear().range([height, 0]);

    const data = RESULTS.map(
        zipData => ({
            affordability: +zipData.affordability.score,
            median_income: +zipData.median_income.score,
            zip_code: +zipData.zip_code,
        })
    ).filter(zipData => zipData.median_income > 0);

    xScale.domain([0, +max]);
    yScale.domain([0, d3.max(RESULTS.map(zipData => +zipData.affordability.score))]);

    const xAxis = g => g.attr('transform', `translate(0, ${height})`)
        .call(d3.axisBottom().scale(xScale));

    const yAxis = g => g.attr('transform', `translate(${marginLeft}, 0)`)
        .call(d3.axisLeft().scale(yScale));

    const xAxisGrid = d3.axisBottom(xScale).tickSize(-height)
        .tickFormat('').tickValues(xScale.ticks());
    svg.append("g")
        .attr('transform', `translate(0, ${height})`)
        .call(xAxisGrid)
        .style("stroke", "#D2D9E5");

    const tooltip = d3.tip()
        .attr('id', 'tooltip')
        .offset([40, 90])
        .style('color', 'white')
        .style('background', "#383838")
        .style('font-size', '10px');
    svg.call(tooltip);

    tooltip.html(function (d) {
        return `<div style="padding: 5%"><b>ZIP Code: ${d.zip_code}</b>
            <br />
            <b>Median income: ${CURRENCY_FORMATTER.format(d.median_income)}</b>
            <br />
            <b>Avg. price per sq.ft: ${d.affordability}</b></div>`;
    });

    svg.selectAll("dot")
        .data(data)
        .enter()
        .append("circle")
        .attr("id", function (d) { return "zip-" + d.zip_code; })
        .attr("cx", function (d) { return xScale(d.median_income); })
        .attr("cy", function (d) { return yScale(d.affordability); })
        .attr("class", function (d) { return postalCode == d.zip_code ? "top" : ""; })
        .attr("r", function (d) { return postalCode == d.zip_code ? 7 : 2.5; })
        .style("fill", function (d) { return postalCode == d.zip_code ? "#084594" : "#F3B868"; })
        .on('mouseover', function (d) { tooltip.show(d); })
        .on('mouseout', function (d) { tooltip.hide(d); });

    svg.select("#zip-" + postalCode)
        .style("fill", "#084594");

    svg.append("g")
        .style("font-size", "12px")
        .call(xAxis);

    svg.append("g")
        .style("font-size", "12px")
        .call(yAxis)
        .selectAll("text");

    svg.append("text")
        .attr("id", "x_axis_label")
        .attr("font-size", 15)
        .attr("font-family", "sans-serif")
        .attr("x", width / 2)
        .attr("y", height + 40)
        .attr("text-anchor", "middle")
        .text("Median income")
        .style({ 'stroke-width': '2px', 'fill': 'black' });

    svg.append("text")
        .attr("id", "y_axis_label")
        .attr("font-size", 15)
        .attr("font-family", "sans-serif")
        .attr("x", -marginTop * 3)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .text("Avg. price per sq.ft")
        .attr("transform", "rotate(-90)");
}

function generateIncidentsChart(postalCode) {
    const bounds = d3.select("#abc2").node().getBoundingClientRect();
    const width = bounds.width, height = width / 2, marginTop = 50, marginLeft = 80;
    const result = RESULTS.find(result => result.zip_code == postalCode);

    if (result) {
        $('#incidents_chart_title').show();
        $('#incidents_chart_title').html('Safety incidents Distribution Chart for ZIP Code ' + postalCode);
        $('#incidents_chart').show();
        $("#incidents_chart").html('');

        const svg = d3.select("#incidents_chart")
            .append("svg")
            .attr("width", width + marginLeft)
            .attr("height", height + marginTop)
            .append("g")
            .attr("transform", `translate(${marginLeft * 0.75})`);

        const incidentsDataKeys = Object.keys(result.incidents);
        const incidentsData = incidentsDataKeys.map(
            key => (
                {
                    label: key,
                    count: result.incidents[key],
                    average: DISTRIBUTIONS['safety_averages'][key]
                }
            )
        );

        console.log(incidentsData);

        const xScale = d3.scaleBand().range([marginLeft, width - marginLeft]).padding(0.2),
            yScale = d3.scaleLinear().range([height, 0]);

        xScale.domain(incidentsDataKeys);
        yScale.domain([0, d3.max(
            incidentsData.map(incident => Math.max(incident.count, incident.average))
        )]);

        var subgroups = ['count', 'average']
        var xSubgroup = d3.scaleBand()
            .domain(subgroups)
            .range([0, xScale.bandwidth()])
            .padding([0.05]);

        var colorPallete = ['#6baed6', '#F3B868'];

        // color palette = one color per subgroup
        var color = d3.scaleOrdinal()
            .domain(subgroups)
            .range(colorPallete);

        const xAxis = g => g.attr('transform', `translate(0, ${height})`)
            .call(d3.axisBottom().scale(xScale));

        const yAxis = g => g.attr('transform', `translate(${marginLeft}, 0)`)
            .call(d3.axisLeft().scale(yScale));

        svg.append("g").attr("id", "bars2")
            .selectAll("g")
            // Enter in data = loop group per group
            .data(incidentsData)
            .enter()
            .append("g")
            .attr("transform", function (d) { return "translate(" + xScale(d.label) + ",0)"; })
            .selectAll("rect")
            .data(function (d) { console.log(d); return subgroups.map(function (key) { return { key: key, value: d[key] }; }); })
            .enter().append("rect")
            .attr("x", function (d) { return xSubgroup(d.key); })
            .attr("y", function (d) { return yScale(d.value); })
            .attr("width", xSubgroup.bandwidth())
            .attr("height", function (d) { console.log(d); return height - yScale(d.value); })
            .attr("fill", function (d) { return color(d.key); });

        svg.append("g")
            .style("font-size", "12px")
            .call(xAxis);

        svg.append("g")
            .call(yAxis)
            .selectAll("text");

        svg.append("text")
            .attr("id", "x_axis_label2")
            .attr("font-size", 12)
            .attr("font-family", "sans-serif")
            .attr("x", width / 2)
            .attr("y", height + 40)
            .attr("text-anchor", "middle")
            .text("Type of Incidents (ZIP code vs. Average)")
            .style({ 'stroke-width': '2px', 'fill': 'black' });

        svg.append("text")
            .attr("id", "y_axis_label2")
            .attr("font-size", 12)
            .attr("font-family", "sans-serif")
            .attr("x", -120)
            .attr("y", -10)
            .attr("text-anchor", "middle")
            .text("Safety incidents")
            .attr("transform", "rotate(-90)");

        const labels = [postalCode, 'Average'];
        svg.append("g")
            .selectAll("g")
            .data(colorPallete)
            .enter()
            .append("text")
            .attr("x", width - 0.75 * marginLeft)
            .attr("y", (d, i) => (i) * marginTop / 2 + 12)
            .attr("font-size", 14)
            .text((d, i) => labels[i]);

        svg.append("g")
            .selectAll("g")
            .data(colorPallete)
            .enter()
            .append("rect")
            .attr("x", width - marginLeft - 10)
            .attr("y", (d, i) => (i) * marginTop / 2)
            .attr("width", 20)
            .attr("height", 15)
            .attr('fill', d => d);
    }
}

function generateLegend() {
    // legend
    const height = 160, width = 150, marginTop = 10, marginLeft = 10;
    $("#legend").html('');

    const svg = d3.select("#legend")
        .append("svg")
        .attr('translate', 'transform(' + marginLeft + ', ' + marginTop + ')');

    svg.attr("width", width)
        .attr("height", height)
        .selectAll("legend-colors")
        .data(ARR)
        .enter()
        .append("rect")
        .attr("fill", function (d) {
            return COLOR_SCALE(d3.quantile(RESULTS.map(result => result.total_score), d));
        })
        .attr("width", 15)
        .attr("height", 15)
        .attr("x", "20")
        .attr("y", function (d, i) { return i * 18 + 15 });

    svg.selectAll("legend-text")
        .data(ARR)
        .enter()
        .append('text')
        .attr('font-family', 'sans-serif')
        .text(function (d, i) {
            return String(
                String(d3.format(".2f")(d3.quantile(RESULTS.map(result => result.total_score), d)))
            ) + " to " + String(d3.format(".2f")(d3.quantile(RESULTS.map(result => result.total_score), d - PERCENTILE_INC)))
        })
        .attr('text-anchor', 'start')
        .attr('font-size', 13)
        .attr('x', 45)
        .attr('y', function (d, i) { return i * 18 + 28 })
        .attr('fill', 'black');
}


function controlFromInput(fromSlider, fromInput, toInput, controlSlider) {
    const [from, to] = getParsed(fromInput, toInput);
    fillSlider(fromInput, toInput, '#C6C6C6', '#25daa5', controlSlider);
    if (from > to) {
        fromSlider.value = to;
        fromInput.value = to;
    } else {
        fromSlider.value = from;
    }
}

function controlToInput(toSlider, fromInput, toInput, controlSlider) {
    const [from, to] = getParsed(fromInput, toInput);
    fillSlider(fromInput, toInput, '#C6C6C6', '#25daa5', controlSlider);
    setToggleAccessible(toInput);
    if (from <= to) {
        toSlider.value = to;
        toInput.value = to;
    } else {
        toInput.value = from;
    }
}

function controlFromSlider(fromSlider, toSlider, fromInput) {
    const [from, to] = getParsed(fromSlider, toSlider);
    fillSlider(fromSlider, toSlider, '#C6C6C6', '#25daa5', toSlider);
    if (from > to) {
        fromSlider.value = to;
        fromInput.value = to;
    } else {
        fromInput.value = from;
    }
}

function controlToSlider(fromSlider, toSlider, toInput) {
    const [from, to] = getParsed(fromSlider, toSlider);
    fillSlider(fromSlider, toSlider, '#C6C6C6', '#25daa5', toSlider);
    setToggleAccessible(toSlider);
    if (from <= to) {
        toSlider.value = to;
        toInput.value = to;
    } else {
        toInput.value = from;
        toSlider.value = from;
    }
}

function getParsed(currentFrom, currentTo) {
    const from = parseInt(currentFrom.value, 10);
    const to = parseInt(currentTo.value, 10);
    return [from, to];
}

function fillSlider(fromSlider, toSlider, sliderColor, rangeColor, controlSlider) {
    const rangeDistance = toSlider.max - toSlider.min;
    const fromPosition = fromSlider.value - toSlider.min;
    const toPosition = toSlider.value - toSlider.min;
    controlSlider.style.background = `linear-gradient(
      to right,
      ${sliderColor} 0%,
      ${sliderColor} ${(fromPosition) / (rangeDistance) * 100}%,
      ${rangeColor} ${((fromPosition) / (rangeDistance)) * 100}%,
      ${rangeColor} ${(toPosition) / (rangeDistance) * 100}%,
      ${sliderColor} ${(toPosition) / (rangeDistance) * 100}%,
      ${sliderColor} 100%)`;
}

function setToggleAccessible(currentTarget) {
    const toSlider = document.querySelector('#toSlider');

    if (Number(currentTarget.value) <= 0) {
        toSlider.style.zIndex = 2;
    } else {
        toSlider.style.zIndex = 0;
    }
}

function setupPriceRangeInputSlider() {
    const fromSlider = document.querySelector('#fromSlider');
    const toSlider = document.querySelector('#toSlider');
    const fromInput = document.querySelector('#fromInput');
    const toInput = document.querySelector('#toInput');
    fillSlider(fromSlider, toSlider, '#C6C6C6', '#25daa5', toSlider);
    setToggleAccessible(toSlider);

    fromSlider.oninput = () => controlFromSlider(fromSlider, toSlider, fromInput);
    toSlider.oninput = () => controlToSlider(fromSlider, toSlider, toInput);
    fromInput.oninput = () => controlFromInput(fromSlider, fromInput, toInput, toSlider);
    toInput.oninput = () => controlToInput(toSlider, fromInput, toInput, toSlider);
}

function hideBottomCharts() {
    $('.percentile_squares').hide();

    $('#housing_price_chart_title').hide();
    $('#percentile_scores_title').hide();
    $('#price_distribution_chart').hide();

    $('#incidents_chart').hide();
    $('#incidents_chart_title').hide();

    $('#scatter_distribution_chart').hide();
    $('#scatter_distribution_chart_title').hide();

    $('#search_link').hide();
}

