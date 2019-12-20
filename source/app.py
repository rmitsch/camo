"""
Note: Layout to be considered temporary until streamlit introduces native layouting options.
todo:
    - Move separate analyses into functions, branching off same root DF.
    - Mixed layout (when supported by streamlit).
"""

import pandas as pd
import streamlit as st
import plotly
import plotly.express as px
import plotly.graph_objects as go
import sys
sys.path.append('../')
import source.utils as utils
from source.fileparsing import ODSReader


st.title("Batcave Cashflow")
st.sidebar.title("Settings")

# Read entries from spreadsheet, add artifical data points for investment so that line is drawn from beginning to end
# of plot.
entries: pd.DataFrame = utils.add_investment_fillers(ODSReader("/home/raphael/Documents/Finanzen/Cashflow.ods").entries)

# Gather all users (assuming that each user paid at least once).
users: list = entries.From.unique().tolist()

# One-hot encode beneficiaries.
entries["n_beneficiaries"] = entries.To.str.split(",").apply(len)
for user in users:
    entries["amount_to_" + user] = entries.To.str.contains(user) * entries.Amount / entries.n_beneficiaries

# Sum values per day and category. Ignore amortization entries for time chart, since they are only interesting for the
# community balance calculation.
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

# Plot cashflow.
plot: plotly.graph_objects.Figure = px.line(
    entries_cumulative, x="Date", y="Amount", title='', color="color", line_shape="hvh"
)
plot.update_layout(
    margin=dict(l=0, r=0, t=0, b=0),
    legend=dict(x=0, y=0)
)
plot.update_yaxes(range=[entries_cumulative.min().Amount * 1.1, entries_cumulative.max().Amount * 1.1])
st.plotly_chart(plot, width=800, height=170)

# Initialize data for community balance.
community_balance_data: dict = {user: {"paid_by": 0, "paid_for": 0} for user in users}
# Limit entries to those with more than one recipient (or amortizations).
amortizations: pd.DataFrame = entries[entries.Category == "Amortization"]
community_entries: pd.DataFrame = entries[
    (entries.Category != "Amortization") &
    ((entries.n_beneficiaries > 1) | (~entries.From.isin(entries.To)))
]
st.write("amort")
st.write(amortizations)
st.write("comm entrei")
st.write(community_entries)

# Compute all sums that were paid _by_ given user. Assuming payer is only ever a single person.
community_balances: dict = community_entries.groupby("From").sum()[["Amount"]].to_dict()["Amount"]

# Compute all sums that were paid _for_ given user.
for user in users:
    community_balances[user] -= community_entries["amount_to_" + user].sum()

# Consider amortizations.
for ix, row in amortizations.groupby(["From", "To"]).sum()[["Amount"]].iterrows():
    community_balances[ix[0]] -= row.Amount
    community_balances[ix[1]] += row.Amount

st.write("Community balance:", community_balances)
