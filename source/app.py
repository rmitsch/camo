"""
Note: Layout to be considered temporary until streamlit introduces native layouting options.
todo:
    - date range controls in sidebar
    - by category
    - Mixed layout (when supported by streamlit).
"""


import pandas as pd
import streamlit as st
import plotly
import plotly.express as px
import plotly.graph_objects as go
from typing import Tuple, List, Dict
import datetime
import sys
sys.path.append('../')
import source.utils as utils


st.title("Batcave Cashflow")
st.sidebar.title("Settings")
st.sidebar.subheader("V0.3")

# Load data.
loaded_data: Tuple[pd.DataFrame, List[str]] = utils.load_data("/home/raphael/Documents/Finanzen/Cashflow.ods")
entries: pd.DataFrame = loaded_data[0]
users: List[str] = loaded_data[1]

# Select which user to plot cumulative liquidity for.
show_cashflow_for: str = st.sidebar.selectbox("Show cash flow for:", users)

# Process time threshold input.
first_day: datetime.date = st.sidebar.date_input("From:", entries.Date.min())
last_day: datetime.date = st.sidebar.date_input("To:", entries.Date.max())
assert first_day <= last_day, "First day must be before last day."

# Get entries in restricted date range.
entries_in_restricted_date_range: pd.DataFrame = entries[
    (entries.Date >= first_day) &
    (entries.Date <= last_day)
]

# Show apartment expenses
# df = entries_in_restricted_date_range
# st.write(df[(df.Category == "Apartment") & (df.To == "R, M")])
# st.write(df[(df.Category == "Apartment") & (df.To == "R, M")][["Amount"]].sum())

# Get timeseries data, filter.
entries_cumulative_by_user: pd.DataFrame = utils.compute_liquidity_timeseries(entries, users)
entries_cumulative_by_user = entries_cumulative_by_user[
    # Limit to user to show cash flow for.
    (entries_cumulative_by_user.user == show_cashflow_for)
]
entries_cumulative_by_user.Category = entries_cumulative_by_user.Category.apply(
    lambda x: "Investment" if x == "Investment" else "Cashflow"
)

# todo Add/check filler investment entries in entries_cumulative to make sure investment line is visible event if fewer
#  then two events are in selected timeframe.

# Plot cumulative cashflow.
plot: plotly.graph_objects.Figure = px.line(
    entries_cumulative_by_user,
    x="Date",
    y="Amount",
    title="Liquidity and Investment Over Time",
    color="Category",
    line_shape="hvh"
)
plot.update_layout(
    margin=dict(l=0, r=0, t=30, b=0),
    legend=dict(x=0, y=0)
)
plot.update_yaxes(range=[entries_cumulative_by_user.min().Amount * 0.9, entries_cumulative_by_user.max().Amount * 1.1])
st.plotly_chart(plot, width=800, height=150)

# Plot expenses by category and month.
target_col: str = "amount_to_" + show_cashflow_for
df: pd.DataFrame = entries_in_restricted_date_range.copy(deep=True)
df.Date = pd.to_datetime(df.Date.astype(str).str[:-2] + "01")
plot: plotly.graph_objects.Figure = px.bar(
    df.groupby(["Category"])[[target_col]].sum().rename(columns={target_col: "Amount"}).reset_index(),
    x="Category",
    y="Amount",
    title="Sum per category for user"
)
plot.update_layout(
    margin=dict(l=0, b=0),  # , r=0, t=30,
    legend=dict(x=0, y=0)
)
st.plotly_chart(plot, width=850, height=350)


# Initialize filtered data for community balance.
community_balances: Dict[str, float] = utils.compute_community_balance(
    entries_in_restricted_date_range, users
)
plot = go.Figure([go.Bar(x=users, y=[community_balances[user] for user in users])])
plot.update_layout(
    title="Community Balance",
    xaxis_title="",
    yaxis_title="€",
    margin=dict(l=0, r=0, t=30, b=0)
)
st.plotly_chart(plot, width=200, height=200)
