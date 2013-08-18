(function (JGS, $, undefined) {

  /**
   This class provides javascript handling specific  to the example1 page. Most importantly, it provides the dygraphs
   setup and handling, including the handling of mouse-down/up events on the dygraphs range control element.

   @class Demo1Page
   @constructor
   */
  JGS.Demo1Page = function (pageCfg) {
    this.$graphCont = pageCfg.$graphCont;

    this.graphDataProvider = new JGS.GraphDataProvider();
    this.graphDataProvider.newGraphDataCallbacks.add($.proxy(this._onNewGraphData, this));

    this.isRangeSelectorActive = false;
  };

  /**
   * Starts everything by requesting initial data load. For example's purposes, initial date extents are hardcoded.
   *
   * @method
   */
  JGS.Demo1Page.prototype.init = function () {
    this.showSpinner(true);

    // Default range dates
    var rangeEndMom = moment().utc();
    rangeEndMom.startOf('hour');
    rangeEndMom.add('hour', 1);
    var rangeStartMom = moment.utc(rangeEndMom).add('year', -2);

    // Default detail dates
    var detailEndMom = moment(rangeEndMom);
    detailEndMom.add('day', -90);
    var detailStartMom = moment(detailEndMom);
    detailStartMom.add('day', -180);

    this.graphDataProvider.loadData("Series-A", rangeStartMom.toDate(), rangeEndMom.toDate(), detailStartMom.toDate(), detailEndMom.toDate(), this.$graphCont.width());

  };

  /**
   * Internal method to add mouse down listener to dygraphs range selector.  Coded so that it can be called
   * multiple times without concern. Although not necessary for simple example (like example1), this becomes necessary
   * for more advanced examples when the graph must be recreated, not just updated.
   *
   * @method _setupRangeMouseHandling
   * @private
   */
  JGS.Demo1Page.prototype._setupRangeMouseHandling = function () {
    var self = this;

    // Element used for tracking mouse up events
    this.$mouseUpEventEl = $(window);
    if ($.support.cssFloat == false) { //IE<=8, doesn't support mouse events on window
      this.$mouseUpEventEl = $(document.body);
    }

    //Minor Hack...not sure how else to hook-in to dygraphs range selector events without modifying source. This is
    //where minor modification to dygraphs (range selector plugin) might make for a cleaner approach.
    //We only want to install a mouse up handler if mouse down interaction is started on the range control
    var $rangeEl = this.$graphCont.find('.dygraph-rangesel-fgcanvas, .dygraph-rangesel-zoomhandle');

    //Uninstall existing handler if already installed
    $rangeEl.off("mousedown.jgs touchstart.jgs");

    //Install new mouse down handler
    $rangeEl.on("mousedown.jgs touchstart.jgs", function (evt) {

      //Track that mouse is down on range selector
      self.isRangeSelectorActive = true;

      // Setup mouse up handler to initiate new data load
      self.$mouseUpEventEl.off("mouseup.jgs touchend.jgs"); //cancel any existing
      $(self.$mouseUpEventEl).on('mouseup.jgs touchend.jgs', function (evt) {
        self.$mouseUpEventEl.off("mouseup.jgs touchend.jgs");

        //Mouse no longer down on range selector
        self.isRangeSelectorActive = false;

        //Get the new detail window extents
        var graphAxisX = self.graph.xAxisRange();
        self.detailStartDateTm = new Date(graphAxisX[0]);
        self.detailEndDateTm = new Date(graphAxisX[1]);

        // Load new detail data
        self._loadNewDetailData();
      });

    });


  };


  JGS.Demo1Page.prototype._loadNewDetailData = function () {
    this.showSpinner(true);
    this.graphDataProvider.loadData("Series-A", null, null, this.detailStartDateTm, this.detailEndDateTm, this.$graphCont.width());
  };

  JGS.Demo1Page.prototype._onNewGraphData = function (graphData) {
    console.log("onNewGraphData", graphData);

    this.drawDygraph(graphData);
    this.showSpinner(false);

  };

  JGS.Demo1Page.prototype.drawDygraph = function (graphData) {

    console.log("drawDygraph");

    var dyData = graphData.dyData;
    var detailStartDateTm = graphData.detailStartDateTm;
    var detailEndDateTm = graphData.detailEndDateTm;

    var recreateDygraph = false; // will be need later when supporting show/hide multiple series


    var labels = ["time", "Series-A"];

    var useAutoRange = false; // normally configurable, but for demo easier to see with fixed range and we hardcode
    var expectMinMax = true;

    var axes = {};
    if (useAutoRange) {
      axes.y = {valueRange: null};
    } else {
      axes.y = {valueRange: [0, 1500]};
    }

    if (!this.graph || recreateDygraph) {

      var graphCfg = {
        axes: axes,
        labels: labels,
        customBars: expectMinMax,
        showRangeSelector: true,
        interactionModel: Dygraph.Interaction.defaultModel,
        //clickCallback: $.proxy(this._onDyClickCallback, this),
        connectSeparatedPoints: true,
        dateWindow: [detailStartDateTm.getTime(), detailEndDateTm.getTime()],
        //drawCallback: $.proxy(this._onDyDrawCallback, this),
        zoomCallback: $.proxy(this._onDyZoomCallback, this),
        digitsAfterDecimal: 2
      };
      this.graph = new Dygraph(this.$graphCont.get(0), dyData, graphCfg);

      this._setupRangeMouseHandling();

    }
    else {
      var graphCfg = {
        axes: axes,
        labels: labels,
        file: dyData,
        dateWindow: [detailStartDateTm.getTime(), detailEndDateTm.getTime()]
      };
      this.graph.updateOptions(graphCfg);
    }

  };

  JGS.Demo1Page.prototype._onDyZoomCallback = function (minDate, maxDate, yRanges) {
    console.log("_onDyZoomCallback");

    if (this.graph == null)
      return;

    this.detailStartDateTm = new Date(minDate);
    this.detailEndDateTm = new Date(maxDate);

    //When zoom reset via double-click, there is no mouse-up event in chrome (maybe a bug?),
    //so we initiate data load directly
    if (this.graph.isZoomed('x') === false) {
      this.$mouseUpEventEl.off("mouseup.jgs touchend.jgs"); //Cancel current event handler if any
      this._loadNewDetailData();
      return;
    }

    //Check if need to do IE8 workaround
    if ($.support.cssFloat == false) { //IE<=8
      // ie8 calls drawcallback with new dates before zoom. This example currently does not implement the
      // drawCallback, so zooming likely does not work in IE8 currently. This next line might work, but will
      // result in duplicate loading when drawCallback is added back in.
      this._loadNewDetailData();
      return;
    }

    //The zoom callback is called when zooming via mouse drag on graph area, as well as when
    //dragging the range selector bars. We only want to initiate dataload when mouse-drag zooming. The mouse
    //up handler takes care of loading data when dragging range selector bars.
    var doDataLoad = !this.isRangeSelectorActive;
    if (doDataLoad === true)
      this._loadNewDetailData();

  };

  JGS.Demo1Page.prototype.showSpinner = function (show) {
    if (show === true) {
      if (this.spinner == null) {
        var opts = {
          lines: 13, // The number of lines to draw
          length: 7, // The length of each line
          width: 6, // The line thickness
          radius: 10, // The radius of the inner circle
          corners: 1, // Corner roundness (0..1)
          rotate: 0, // The rotation offset
          color: '#000', // #rgb or #rrggbb
          speed: 1, // Rounds per second
          trail: 60, // Afterglow percentage
          shadow: false, // Whether to render a shadow
          hwaccel: false, // Whether to use hardware acceleration
          className: 'spinner', // The CSS class to assign to the spinner
          zIndex: 2e9, // The z-index (defaults to 2000000000)
          top: 'auto', // Top position relative to parent in px
          left: 'auto' // Left position relative to parent in px
        };
        var target = this.$graphCont.parent().get(0);
        this.spinner = new Spinner(opts);
        this.spinner.spin(target);
        this.spinnerIsSpinning = true;
      } else {
        if (this.spinnerIsSpinning === false) { //else already spinning
          this.spinner.spin(this.$graphCont.get(0));
          this.spinnerIsSpinning = true;
        }
      }
    } else if (this.spinner != null && show === false) {
      this.spinner.stop();
      this.spinnerIsSpinning = false;
    }

  };

}(window.JGS = window.JGS || {}, jQuery));