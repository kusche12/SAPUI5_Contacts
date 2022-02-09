/* global QUnit */

QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function() {
	"use strict";

	sap.ui.require([
		"ui5contacts/test/integration/AllJourneys"
	], function() {
		QUnit.start();
	});
});