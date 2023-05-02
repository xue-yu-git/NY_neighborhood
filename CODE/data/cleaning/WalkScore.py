# This is a sample Python script.
import pandas as pd
from walkscore import WalkScoreAPI

# Press Shift+F10 to execute it or replace it with your code.
# Press Double Shift to search everywhere for classes, files, tool windows, actions, and settings.

# Press the green button in the gutter to run the script.
if __name__ == '__main__':
    api_key = '' # API_KEY
    score_api = WalkScoreAPI(api_key=api_key)

    df = pd.read_excel("WalkScore_lat_long_2.xlsx")
    print(df.count())
    walk_scores = []
    transit_scores = []

    for index, row in df.iterrows():
        if index%100 == 0:
            print(index)
        try:
            result = score_api.get_score(longitude=row.longitude, latitude=row.latitude)
            walk_scores.append(result.walk_score)
            transit_scores.append(result.transit_score)
        except:
            walk_scores.append(None)
            transit_scores.append(None)
            print(index, row.longitude, row.latitude)

    df["walk_score"] = walk_scores
    df["transit_score"] = transit_scores
    df.to_csv("ny_crime_2018_to_2021.csv")

    # See PyCharm help at https://www.jetbrains.com/help/pycharm/
