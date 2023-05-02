Neighborhood Ranking Scores: Analyzing the community quality of NYC real estate properties
==========================================================================================

------------
DESCRIPTION
------------

This package is the final project by Team 053 for CSE 6242 (Data and Visual Analytics). Our project, "Neighborhood Ranking Scores: Analyzing the community quality of NYC real estate properties," calculates and analyzes ranking scores for New York neighborhoods.

The application enables users to generate their custom rankings for zip codes in New York City based on their preference for following attributes: Affordability, Safety and Accessibility.

The project folder (all under `CODE/` folder) has following structure:

.CODE/
    api_format/ - Defines the API contract between our backend server and the frontend UI application

    data/
        cleaning/ - Scripts used in Data cleaning

    static/
        css/ - CSS files from UI libraries used in applciation's frontend (ex. Bootstrap)

        lib/ - JavaScript files from UI libraries used in application's frontend (ex. d3.js, LeafletJS)

        index.js - Main JavaScript file which implements the Frontend application

        merged_data.csv - Cleaned and merged data set used in deploying the application

        nyc-zip-code-polygons.geojson - GeoJSON format storing the boundaries for New York City's zip codes

        style.css - Custom CSS for frontend application

    templates/
        index.html - Template HTML that is used to render the frontend application

    main.py - the main server application that hosts the API for frontend to communicate with, performs all the data processing and returns the processed data for frontend to render.

    requirements.txt - Defines the Python3 libraries required for running the application


Data:
-----
    1. Zillow dataset on Kaggle as of January 20, 2021: https://www.kaggle.com/datasets/ericpierce/new-york-housing-zillow-api
    2. New York Crime Incident Level Complaint Dataset (Historical and Year to Date): https://data.cityofnewyork.us/Public-Safety/NYPD-Complaint-Data-Historic/qgea-i56i / https://data.cityofnewyork.us/Public-Safety/NYPD-Complaint-Data-Current-Year-To-Date-/5uac-w243
    3. Walk Score and Transit Score information via Walk Score API: https://www.walkscore.com/professional/api.php
    4. Median Income levels : https://data.census.gov/table?q=Income+and+Poverty&g=040XX00US36$8600000&tid=ACSST5Y2021.S1903
    5. Population by zip code for New York City : https://www.newyork-demographics.com/zip_codes_by_population



Data pre-processing:
-------------------

1. Zillow Dataset:
------------------
    1.1 Remove duplicates in Zillow dataset keeping the most recent listing record with selling price more than $100,000. This is done to retain correct prices for listings with foreclosure actions (they are listed at really low prices $1, $100 properties).

    1.2 Exclude Zillow listings with State and Zip codes not in New York City

    1.3 Exclude Zillow listings with Living Area less than 100 sqft

    1.4 Exclude listings with blank Zip code, Price and Living Area information

    1.5 Exclude listings with Price per sq ft less than $100/sqft

2. Walk Score and Transit Score:
-------------------------------
    2.1 Register for an account to get API key at https://www.walkscore.com/professional/api.php

    2.2 Run the data cleaning code on each listing in Zillow dataset using the latitude and longitude information. The relevant data cleaning code is placed at `CODE/data/cleaning/WalkScore.py`.

3. Safety/Crime Rate:
----------------------
    3.1 Include data from Year 2018 to 2022. 2018 to 2021 records used from Historic complaint dataset and 2022 records used from Year To Date Complaint dataset

    3.2 Fetch zip codes for each incident using latitude and longitude information in crime datset.  The relevant data cleaning code is placed at `CODE/data/cleaning/index-latlngzip.js`.

    3.3 Calculate counts of incidents for each zip code and crime category. The relevant data cleaning code is placed at `CODE/data/cleaning/crime_visualization.py`.

-------------
INSTALLATION
-------------

The instructions are based on Ubuntu OS (either independently or via Windows Subsystem for Linux (WSL)). The code is dependent on Python3 (ideally Python version >= 3.3).

Install the other necessary packages found in `requirements.txt` under the CODE folder using the following commands:

`$ python -m venv env # setups the virtual environment`

`(env) $ source env/bin/activate # activates the virtual environment`

`(env) $ pip install -r requirements.txt # install dependencies`


----------
EXECUTION
----------

Run locally
-----------

After completing the installation, to run the code, run "main.py" file within the CODE directory via the following command:

`(env) $ python -m flask --app main run`

This would run the application locally on 5000 port. You can navigate to http://localhost:5000 in a browser of your choice to open the application.

Recommended browsers are Firefox and Chrome for best performance.


Demo Video
-----------
https://youtu.be/jzi92b8Cq5Q


Contributors
------------

- Harsharn Kaur (hkaur45)
- Katherine Tang (ktang79)
- Xue Yu (xyu417)
- Khang Tran (ktran322)
- Ian Stalter (istalter3)
