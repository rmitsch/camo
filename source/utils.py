import pandas as pd
from typing import Tuple, List, Dict
from source.fileparsing import ODSReader


def compute_community_balance(entries: pd.DataFrame, users: List[str]) -> Dict[str, float]:
    """
    Computes community balances for all specified users.
    :param entries:
    :type entries:
    :param users:
    :type users:
    :return: Dictionary with community balances by user. Negative number means user is owed, positive number means user
    owes.
    :rtype: Dict[str, float]
    """
    # Initialize data for community balance.
    community_balance_data: dict = {user: {"paid_by": 0, "paid_for": 0} for user in users}
    # Limit entries to those with more than one recipient (or amortizations).
    amortizations: pd.DataFrame = entries[entries.Category == "Amortization"]
    community_entries: pd.DataFrame = entries[
        (entries.Category != "Amortization") &
        ((entries.n_beneficiaries > 1) | (~entries.From.isin(entries.To)))
    ]

    # Compute all sums that were paid _by_ given user. Assuming payer is only ever a single person.
    community_balances: dict = community_entries.groupby("From").sum()[["Amount"]].to_dict()["Amount"]

    # Compute all sums that were paid _for_ given user.
    for user in users:
        community_balances[user] -= community_entries["amount_to_" + user].sum()

    # Consider amortizations.
    for ix, row in amortizations.groupby(["From", "To"]).sum()[["Amount"]].iterrows():
        community_balances[ix[0]] -= row.Amount
        community_balances[ix[1]] += row.Amount

    return community_balances


def load_data(spreadsheet_path: str) -> Tuple[pd.DataFrame, List[str]]:
    """
    Loads and parses spreadsheet data.
    :param spreadsheet_path:
    :type spreadsheet_path:
    :return: Parsed entries in spreadsheet, list of user names/abbreviations.
    :rtype: Tuple[pd.DataFrame, List[str]]
    """
    # Load and parse spreadsheet.
    entries: pd.DataFrame = add_investment_filler_entries(ODSReader(spreadsheet_path).entries)

    # Gather all users (assuming that each user paid at least once).
    users: list = entries.From.unique().tolist()

    # One-hot encode beneficiaries.
    entries["n_beneficiaries"] = entries.To.str.split(",").apply(len)
    for user in users:
        entries["amount_to_" + user] = entries.To.str.contains(user) * entries.Amount / entries.n_beneficiaries

    return entries, users


def compute_liquidity_timeseries(entries: pd.DataFrame, users: List[str]) -> pd.DataFrame:
    """
    Computes cumulative sums for liquidity/investment timeseries chart.
    :param entries:
    :type entries:
    :param users:
    :type users:
    :return: Cumulative entries (as dataframe) by user.
    :rtype: pd.DataFrame
    """

    # Sum values per day and category. Ignore amortization entries for time chart, since they are only interesting for
    # the community balance calculation.
    entries_cumulative: pd.DataFrame = entries[
        entries.Category != "Amortization"
    ].groupby(["Date", "Category"]).sum().reset_index()
    entries_cumulative.Date = pd.to_datetime(entries_cumulative.Date)
    investment_entry_idx: pd.Series = (entries_cumulative.Category == "Investment")

    entries_cumulative_by_user: list = []
    for user in users:
        amount_user_col: str = "amount_to_" + user
        # Assemble dataframe for cumulative sum of investment and non-investement data.
        df: pd.DataFrame = pd.concat([
            # Investment is treated as special kind expense, but here we want it to be displayed as positive in the
            # charts.
            entries_cumulative[investment_entry_idx].set_index(["Category", "Date"])[[amount_user_col]].cumsum() * -1,
            # Everything but investment and amortization, since they are to be treated differently.
            entries_cumulative[~investment_entry_idx].set_index(["Category", "Date"])[[amount_user_col]].cumsum()
        ]).reset_index().rename(columns={amount_user_col: "Amount"})

        # Add user identifier.
        df["user"] = user

        # Append to list.
        entries_cumulative_by_user.append(df)

    # Merge dataframes.
    entries_cumulative_by_user: pd.DataFrame = pd.concat(entries_cumulative_by_user)

    return entries_cumulative_by_user


def add_investment_filler_entries(entries: pd.DataFrame) -> pd.DataFrame:
    """
    Adds fillers for investment so that glyphs in charts match with start and end of entire timespan under
    consideration.
    :param entries: Dataframe with entries from spreadsheet.
    :return: Entries with appended filler entries for investments.
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
