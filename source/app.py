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
from typing import Tuple, List
import sys
sys.path.append('../')
import source.utils as utils


st.title("Batcave Cashflow")
st.sidebar.title("Settings")

# Load data.
loaded_data: Tuple[pd.DataFrame, List[str]] = utils.load_data("/home/raphael/Documents/Finanzen/Cashflow.ods")
entries: pd.DataFrame = loaded_data[0]
users: List[str] = loaded_data[1]

# Get timeseries data.
entries_cumulative: pd.DataFrame = utils.compute_liquidity_timeseries(entries)

# Plot cashflow.
plot: plotly.graph_objects.Figure = px.line(
    entries_cumulative,
    x="Date",
    y="Amount",
    title="Liquidity and Investment Over Time",
    color="color",
    line_shape="hvh"
)
plot.update_layout(
    margin=dict(l=0, r=0, t=30, b=0),
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

# Compute all sums that were paid _by_ given user. Assuming payer is only ever a single person.
community_balances: dict = community_entries.groupby("From").sum()[["Amount"]].to_dict()["Amount"]

# Compute all sums that were paid _for_ given user.
for user in users:
    community_balances[user] -= community_entries["amount_to_" + user].sum()

# Consider amortizations.
for ix, row in amortizations.groupby(["From", "To"]).sum()[["Amount"]].iterrows():
    community_balances[ix[0]] -= row.Amount
    community_balances[ix[1]] += row.Amount

plot = go.Figure([go.Bar(x=users, y=[community_balances[user] for user in users])])
plot.update_layout(
    title="Community Balance",
    xaxis_title="",
    yaxis_title="€",
    margin=dict(l=0, r=0, t=30, b=0)
)
st.plotly_chart(plot, width=200, height=200)
