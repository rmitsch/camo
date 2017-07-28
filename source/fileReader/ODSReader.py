from numpy.ma import bench
from pyexcel_ods import get_data
import pandas as pd
import numpy as np

# Reads input files in .ods format.
class ODSReader:
    # Initialize collection of original dataframes from .ods file.
    originalData = dict()
    # Initialize collection of cleaned dataframes from .ods file.
    data = dict()
    # Collect corrupt data frames for all types of data.
    corruptData = dict()

    def __init__(self, filepath):
        # Read file at specified location.
        self.readFile(filepath)

    '''
        Reads input file, parses and cleans data. Stores cleaned data in self.dataframes.
        @:param filepath Path to .ods file containing relevant data.
    '''
    def readFile(self, filepath):
        # Extract raw data, transform into data frame.
        rawData = get_data(filepath)

        #######################################
        # Iterate through sheets, discard rows
        # with null values in not nullable
        # columns.
        #######################################

        for sheetName in rawData:
            # Convert data into data frame.
            df = pd.DataFrame(rawData[sheetName])
            # Set column headers.
            df.columns = df.iloc[0]
            # Drop row with column names in it.
            df = df[1:]

            # Add to collection of original data.
            self.originalData[sheetName] = df

            # First column in master data sheets contains relevant, not nullable information
            # (category, user name, entry ID, etc.).
            # Drop rows with nulls in this columns.
            df = df[pd.notnull(df.ix[:, 0])]

            # Add to collection.
            self.data[sheetName] = df

        #######################################
        # Check data integrity of entries.
        #######################################

        # 0. Convert type of column amount, drop NaN values.
        self.data["Entries"].Amount = pd.to_numeric(self.data["Entries"].Amount, errors='coerce')

        # 1. Check foreign key constraint from entries.payer to users.abbreviation.
        self.data["Entries"] = self.data["Entries"][
            self.data["Entries"].Payer.isin(
                self.data["Users"].Abbreviation
            )
        ]

        # 2. Check foreign key constraint from entries.category to 'categories income'.category or 'categories expenses'
        # .Category.
        # Additionally, check on invalid values for amount.

        self.data["Entries"] = self.data["Entries"][
            # All rows with a value from sheet Categories Income and a positive amount.
            (
                self.data["Entries"].Category.isin(
                    self.data["Categories Income"].Category
                ) &
                (
                    self.data["Entries"].Amount >= 0
                )
            ) |
            # All rows with a value from sheet Categories Expense and a negative amount.
            (
                # All rows with a value from sheet Categories Income.
                self.data["Entries"].Category.isin(
                    self.data["Categories Expenses"].Category
                ) &
                (
                    self.data["Entries"].Amount <= 0
                )
            )
        ]

        # 3. Check foreign key constraint from beneficiaries to users.name.
        validIDs = []

        # Loop through beneficiaries, since doing it with panda's mechanic is kinda complicated.
        for index, row in self.data["Entries"].iterrows():
            beneficiaries = row.Beneficiaries.replace(' ', '').split(',')
            # Flag signalling correctness of all beneficiaries.
            beneficiariesExist = True

            # Check if every entry in list of beneficaries exists in users.name.
            for beneficary in beneficiaries:
                if beneficary not in self.data["Users"].Abbreviation.values:
                    # Flag this row as incorrect.
                    beneficiariesExist = False
                    break

            # After all beneficiaries have been checked: Decide whether to add row to set of valid rows.
            if beneficiariesExist:
                validIDs.append(row.ID)

        # Update data frame by discarding rows with incorrect beneficiaries.
        self.data["Entries"] = self.data["Entries"][
            self.data["Entries"].ID.isin(
                validIDs
            )
        ]

        # 4. Detect rows with corrupt data.
        self.corruptData["Entries"] = self.originalData["Entries"][
            -self.originalData["Entries"].ID.isin(
                self.data["Entries"].ID
            )
        ]

        # 5. Add (empty) column with cumulative sum.


        print("\n\n*** Corrupt records ***\n\n", self.corruptData["Entries"])

    '''
        Returns data read from spreadsheet.
        @:return Entries in sheet "Entries" as JSON object.
    '''
    def getEntries(self):
        return self.data["Entries"].to_json(orient="records")
