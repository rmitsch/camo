// https://groups.google.com/forum/#!topic/dc-js-user-group/yI6_cbvgfbU
// Initiates loading of charts.
queue()
    .defer(d3.json, "/entries")
    .await(makeGraphs);

// Creates graphs for dashboard.
function makeGraphs(error, projectsJson, statesJson) {

    // Original entries as delivered by the backend.
	var entries         = projectsJson;
	// Auxiliary variable.
    var binWidth        = 100;

    // --------------------------------------------------
    // Prepare and extend projectsJson data.
    // --------------------------------------------------
    entries = prepareRecords(entries, binWidth);

    // --------------------------------------------------
    // Initialize charts.
    // --------------------------------------------------

    // Get chart data.
    var charts = generateGraphObjects(entries, dc);

    // --------------------------------------------------
    // Configure and plot charts.
    // --------------------------------------------------

    plotCharts(charts, dc, binWidth);

    // --------------------------------------------------
    // Final modifications.
    // --------------------------------------------------

    // Jump to top of page.
    $('html,body').scrollTop(0);

    // Add accordion.
    createAccordionForEntryTable();
};