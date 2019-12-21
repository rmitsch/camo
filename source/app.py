"""
Note: Layout to be considered temporary until streamlit introduces native layouting options.
todo:
    - date range controls in sidebar
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
st.sidebar.subheader("V0.2")

# Load data.
loaded_data: Tuple[pd.DataFrame, List[str]] = utils.load_data("/home/raphael/Documents/Finanzen/Cashflow.ods")
entries: pd.DataFrame = loaded_data[0]
users: List[str] = loaded_data[1]

# Process time threshold input.
first_day: datetime.date = st.sidebar.date_input("From:", entries.Date.min())
last_day: datetime.date = st.sidebar.date_input("To:", entries.Date.max())
assert first_day <= last_day, "First day must be before last day."

# Get timeseries data, filter.
entries_cumulative: pd.DataFrame = utils.compute_liquidity_timeseries(entries)
entries_cumulative = entries_cumulative[
    (entries_cumulative.Date >= first_day) &
    (entries_cumulative.Date <= last_day)
]
# todo Add/check filler investment entries in entries_cumulative to make sure investment line is visible event if fewer
#  then two events are in selected timeframe.

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
plot.update_yaxes(range=[entries_cumulative.min().Amount * 0.9, entries_cumulative.max().Amount * 1.1])
st.plotly_chart(plot, width=800, height=170)

# Initialize filtered data for community balance.
community_balances: Dict[str, float] = utils.compute_community_balance(
    entries[(entries.Date >= first_day) & (entries.Date <= last_day)],
    users
)
plot = go.Figure([go.Bar(x=users, y=[community_balances[user] for user in users])])
plot.update_layout(
    title="Community Balance",
    xaxis_title="",
    yaxis_title="€",
    margin=dict(l=0, r=0, t=30, b=0)
)
st.plotly_chart(plot, width=200, height=200)