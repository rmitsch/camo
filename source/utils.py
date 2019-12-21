import pandas as pd
from typing import Tuple, List
from source.fileparsing import ODSReader


def load_data(spreadsheet_path: str) -> Tuple[pd.DataFrame, List[str]]:
    """
    Loads and parses spreadsheet data.
    :param spreadsheet_path:
    :type spreadsheet_path:
    :return: Parsed entries in spreadsheet, list of user names/abbreviations.
    :rtype: Tuple[pd.DataFrame, List[str]]
    """
    # Load and parse spreadsheet.
    entries: pd.DataFrame = add_investment_fillers(ODSReader(spreadsheet_path).entries)

    # Gather all users (assuming that each user paid at least once).
    users: list = entries.From.unique().tolist()

    # One-hot encode beneficiaries.
    entries["n_beneficiaries"] = entries.To.str.split(",").apply(len)
    for user in users:
        entries["amount_to_" + user] = entries.To.str.contains(user) * entries.Amount / entries.n_beneficiaries

    return entries, users


def compute_liquidity_timeseries(entries: pd.DataFrame) -> pd.DataFrame:
    """
    Computes cumulative sums for liquidity/investment timeseries chart.
    :param entries:
    :type entries:
    :return:
    :rtype:
    """

    # Sum values per day and category. Ignore amortization entries for time chart, since they are only interesting for
    # the community balance calculation.
    entries_cumulative: pd.DataFrame = entries[
        entries.Category != "Amortization"
        ].groupby(["Date", "Category"]).sum().reset_index()
    entries_cumulative.Date = pd.to_datetime(entries_cumulative.Date)
    investment_entry_idx: pd.Series = (entries_cumulative.Category == "Investment")

    # Assemble dataframe for cumulative sum of investment and non-investement data.
    entries_cumulative = pd.concat([
        # Investment is treated as special kind expense, but here we want it to be displayed as positive in the charts.
        entries_cumulative[investment_entry_idx].set_index(["Category", "Date"])[["Amount"]].cumsum() * -1,
        # Everything but investment and amortization, since they are to be treated differently.
        entries_cumulative[~investment_entry_idx].set_index(["Category", "Date"])[["Amount"]].cumsum()
    ]).reset_index()

    # Assign color values for series.
    entries_cumulative["color"] = (entries_cumulative.Category == "Investment").replace({True: "Orange", False: "Blue"})

    return entries_cumulative


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
