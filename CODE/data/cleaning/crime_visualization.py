import pandas as pd
import datetime as dt

df = pd.read_csv("NYPD_Complaint_Data_Current__Year_To_Date_.csv", usecols=["CMPLNT_NUM", "BORO_NM", "CMPLNT_FR_DT", "LAW_CAT_CD", "Latitude", "Longitude"])
df.dropna(inplace=True)
df['CMPLNT_FR_DT'] = pd.to_datetime(df['CMPLNT_FR_DT'], format='%m/%d/%Y', errors='coerce')

#change the below condition to check year from 2018 to 2021 inclusive for historical dataset
df = df[df['CMPLNT_FR_DT'].dt.year == 2022]
df['YEAR'] = df.apply(lambda x: x['CMPLNT_FR_DT'].year, axis=1)
df.drop(columns=['CMPLNT_FR_DT'])
# res = pd.pivot_table(df, values='CMPLNT_NUM', index='YEAR', columns='LAW_CAT_CD', aggfunc='count')
df_hist = pd.read_csv("ny_crime_2018_to_2021.csv")
df_final = pd.concat([df_hist, df], axis=0)
df_final.drop_duplicates(inplace=True)
df_final.to_csv("ny_crime_2018_to_2022.csv", index=False)
zip_df = pd.read_csv("out.csv", header=None, names = ["Latitude","Longitude","Zip_code"])
res = pd.merge(df, zip_df, on=["Latitude","Longitude"])
res = pd.pivot_table(df_final, values='CMPLNT_NUM', index='zip_code', columns='LAW_CAT_CD', aggfunc='count')
