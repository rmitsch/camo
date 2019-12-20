import pandas as pd


def add_investment_fillers(entries: pd.DataFrame) -> pd.DataFrame:
    """
    Adds fillers for investment so that glyphs in charts match with start and end of entire timespan under
    consideration.
    :param entries: Dataframe with entries from spreadsheet.
    :type entries: pd.DataFrame
    :return: Entries with appended filler entries for investments.
    :rtype: pd.DataFrame
    """

    return entries.append(pd.DataFrame([
        {
            "ID": -1,
            "Subject":
                "Filler Investment Start",
            "Category": "Investment",
            "Comment": "",
            "Partner": "",
            "Date": entries.Date.min(),
            "From": "R",
            "To": "R",
            "Amount": 0
        },
        {
            "ID": -2,
            "Subject":
                "Filler Investment End",
            "Category": "Investment",
            "Comment": "",
            "Partner": "",
            "Date": entries.Date.max(),
            "From": "R",
            "To": "R",
            "Amount": 0
        }
    ]))
