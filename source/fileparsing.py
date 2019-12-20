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

    def __init__(self, filepath: str):
        """

        :param filepath:
        """

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
            df = df[~df[df.columns[0]].isnull()].copy(deep=True)

            # Add to collection.
            self.data[sheetName] = df

        #######################################
        # Check data integrity of entries.
        #######################################

        # 0. Convert type of column amount, drop NaN values.
        self.data["Entries"].Amount = pd.to_numeric(self.data["Entries"].Amount, errors='coerce')

        # 1. Check foreign key constraint from entries.payer to users.abbreviation.
        self.data["Entries"] = self.data["Entries"][
            self.data["Entries"].From.isin(self.data["Users"].Abbreviation)
        ]

        # 2. Check foreign key constraint from entries.category to 'categories income'.category or 'categories expenses'
        # .Category.
        # Additionally, check on invalid values for amount.

        categories_data: pd.DataFrame = self.data["Categories"]
        self.data["Entries"] = self.data["Entries"][
            # All rows with a value from sheet Categories Income and a positive amount.
            (
                self.data["Entries"].Category.isin(
                    categories_data[categories_data.Type.isin(("Income", "Mixed"))].Category
                ) &
                (self.data["Entries"].Amount >= 0)
            ) |
            # All rows with a value from sheet Categories Expense and a negative amount.
            (
                # All rows with a value from sheet Categories Income.
                self.data["Entries"].Category.isin(
                    categories_data[categories_data.Type.isin(("Expense", "Mixed"))].Category
                ) &
                (self.data["Entries"].Amount <= 0)
            )
        ]

        # 3. Check foreign key constraint from beneficiaries to users.name.
        valid_ids = []

        # Loop through beneficiaries, since doing it with panda's mechanic is kinda complicated.
        for index, row in self.data["Entries"].iterrows():
            beneficiaries = row.To.replace(' ', '').split(',')
            # Flag signalling correctness of all beneficiaries.
            beneficiaries_exist = True

            # Check if every entry in list of beneficaries exists in users.name.
            for beneficary in beneficiaries:
                if beneficary not in self.data["Users"].Abbreviation.values:
                    # Flag this row as incorrect.
                    beneficiaries_exist = False
                    break

            # After all beneficiaries have been checked: Decide whether to add row to set of valid rows.
            if beneficiaries_exist:
                valid_ids.append(row.ID)

        # Update data frame by discarding rows with incorrect beneficiaries.
        self.data["Entries"] = self.data["Entries"][self.data["Entries"].ID.isin(valid_ids)]

        # 4. Detect rows with corrupt data.
        self.corruptData["Entries"] = self.originalData["Entries"][
            -self.originalData["Entries"].ID.isin(self.data["Entries"].ID)
        ]

        # 5. Add (empty) column with cumulative sum.

        with pd.option_context('display.max_rows', None, 'display.max_columns', None, 'display.width', None):
            print("\n\n*** Corrupt records ***\n\n", self.corruptData["Entries"])

    """
    Returns data read from spreadsheet.
    :return Entries in sheet "Entries" as JSON object.
    """
    @property
    def entries(self) -> pd.DataFrame:
        return self.data["Entries"]
