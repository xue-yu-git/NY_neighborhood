from flask import Flask, render_template, request
from random import randint
import pandas as pd
from scikitmcda.topsis import TOPSIS
from scipy import stats

app = Flask(__name__)

CSV_FILE_NAME = "static/merged_data"
MCDA_SIGNALS_INPUT = [-1, 1, -1]
COLS_USED = ["zipcode", "Price", "livingArea","walk_score", "transit_score", "population_per_1000", "median_income",\
             "violation_count", "felony_count", "misdemeanor_count"]
ATTRIBUTES = {
    "affordability" : "Price_per_sqft",
    "accessibility" : "accessibility",
    "safety"        : "crime_rate"
}
N_BINS = 5

# DataFrame with merged input data
DF = pd.read_csv(CSV_FILE_NAME + ".csv", usecols=COLS_USED, dtype = 'float64')

@app.route("/")
def index():
    return render_template('index.html')

# Main function called by UI
# input.json
@app.route("/calculate", methods=['POST'])
def get_scores():
    response = {}
    request_data = request.get_json()
    weights = [float(request_data['preferences'][i]) for i in ATTRIBUTES]
    price_range_filter = request_data['price_range_filter']
    price_low = float(price_range_filter['low'])
    price_high = float(price_range_filter['high'])

    # print(DF.count())
    filtered_df = _filter_data(DF, price_low, price_high)
    filtered_df = _get_attribute_scores(filtered_df)

    if len(filtered_df) <= 0:
        response['distributions'] = []
        response['results'] = []
        return response
    agg_df = _group_by_zip(filtered_df)

    # call the functions and fill response
    response['distributions'] = _get_distributions(agg_df)
    response['results'] = _get_results(filtered_df, agg_df, weights)

    return response

# calculates total score, and individual scores and score-percentiles
# maps all data according to format in output.json
def _get_results(df, agg_df, weights):
    results = []

    # Calculates percentiles
    percentiles = []
    for key_count, i in enumerate(ATTRIBUTES.keys()):
        percentiles.append(_get_percentile_on_attribute(agg_df, ATTRIBUTES[i]))


    # MCDA scores
    mcda_scores = _get_mcda_scores(agg_df, weights)
    mcda_scores.set_index('alternatives', inplace = True)

    percentiles.append(_get_percentile_on_attribute(agg_df, 'median_income'))
    percentiles.append(_get_percentile_on_attribute(mcda_scores, 'performance score'))

    for count, zip in enumerate(agg_df.index):
        result = {}
        result["zip_code"] = int(zip)
        result["total_score"]= "{:.2f}".format(mcda_scores.loc[zip]['performance score'] * 100)
        result["percentile"]= percentiles[-1][count]
        result

        result["rank"]= mcda_scores.loc[zip]['rank']
        for key_count, i in enumerate(ATTRIBUTES.keys()):
            result[i] = {
                "score" : "{:.2f}".format(agg_df.loc[zip][ATTRIBUTES[i]]),
                "percentile": "{:.2f}".format(percentiles[key_count][count])
                }
        result["median_income"] = {
            "score" : "{:.0f}".format(agg_df.loc[zip]["median_income"]),
            "percentile": "{:.2f}".format(percentiles[key_count][count])
        }
        result["price_chart_data"] = _get_price_chart_data(df, zip)
        result["incidents"] = {
            "felony": agg_df.loc[zip]["felony_count"],
            "misdemeanor": agg_df.loc[zip]["misdemeanor_count"],
            "violation" : agg_df.loc[zip]["violation_count"],
            }
        results.append(result)

    results = sorted(results, key=lambda d: d['rank'])
    return results

# gets the min-max ranges for all three attributes on aggregated df
# maps all data according to format in output.json
def _get_distributions(df):
    distributions = dict()
    for i in ATTRIBUTES.values():
        distributions[i] = {
            "min": "{:.2f}".format(df[i].min()),
            "max": "{:.2f}".format(df[i].max()),
        }
    distributions["safety_averages"] = {
        "felony": "{:.2f}".format(df["felony_count"].mean()),
        "misdemeanor": "{:.2f}".format(df["misdemeanor_count"].mean()),
        "violation":"{:.2f}".format(df["violation_count"].mean())
    }
    income_series = df[df["median_income"] > 0]["median_income"]
    distributions["median_income"] = {
            "min": "{:.0f}".format(income_series.min()),
            "max": "{:.0f}".format(income_series.max()),
        }
    return distributions


# filters rows in data frame on price range
def _filter_data(df, low, high):
    df = df[df['Price'].between(low, high)]
    return df

# aggregate filtered data over zip code - average attributes
def _group_by_zip(df):
    df = df.groupby('zipcode')[['Price_per_sqft', 'accessibility', 'crime_rate', 'median_income', "violation_count", "felony_count", "misdemeanor_count"]].mean()
    return df

# takes in a data frame returned from _group_by_zip
# transforms as per required input to TOPSIS.dataframe()
# sets weights as per user preferences from UI
# set signals
# returns the scores for all zip codes
def _get_mcda_scores(df, weights):
    topsis = TOPSIS()
    df = df.drop(columns=["median_income", "violation_count", "felony_count", "misdemeanor_count"])
    topsis.dataframe(df.values, list(df.index), ATTRIBUTES.values())

    weights = [i/sum(weights) for i in weights]
    topsis.set_weights_manually(weights)

    topsis.set_signals(MCDA_SIGNALS_INPUT)
    topsis.decide()
    # print("RANKING TOPSIS with", topsis.normalization_method , ":\n", topsis.pretty_decision())

    topsis_results = topsis.df_decision
    return topsis_results

# gets percentile for each zip for a given attribute over the zip-aggregated df
def _get_percentile_on_attribute(df, attribute='accessibility'):
    percentiles = list(stats.percentileofscore(df[attribute].values, df[attribute].values))
    return percentiles

# gets price charts data per zip over the filtered data
def _get_price_chart_data(df, zip):

    #outputs pretty string format
    def _get_formatted_string(value):
        if value > 999999:
            return "${:.3f}".format(value/1000000) + "M"
        else:
            return "$"+str(int(value/1000)) + "K"

    price_chart_data = []

    df = df[df['zipcode'] == zip]
    low_price = df['Price'].min()
    increment = (df['Price'].max() - low_price)/5

    for i in range(N_BINS):
        high_price = low_price + increment
        bound = 'both' if i == N_BINS - 1 else 'left'
        price_chart_data.append({
            "low" : low_price,
            "high": high_price,
            "count": sum(df['Price'].between(low_price, high_price, inclusive=bound)),
            "label": _get_formatted_string(low_price) + "-" + _get_formatted_string(high_price)
        })
        low_price = high_price

    return price_chart_data

# calculates accesibility scores and crime rates
def _get_attribute_scores(df):
    df["Price_per_sqft"] = df["Price"]/df["livingArea"]
    df['accessibility'] = 0.5*(df.walk_score + df.transit_score)
    df['crime_rate'] = 0.5*df.felony_count + 0.25*(df.violation_count+df.misdemeanor_count)
    df['crime_rate'] = df['crime_rate']/df['population_per_1000']

    df.drop(columns=['walk_score','transit_score','livingArea','population_per_1000'], inplace=True)
    return df


