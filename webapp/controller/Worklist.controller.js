sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"../model/formatter",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/odata/v2/ODataModel",
	"sap/m/MessageToast",
	"sap/base/util/uid"
], function (BaseController, JSONModel, formatter, Filter, 
	FilterOperator, ODataModel, MessageToast, uid) {	
		"use strict";

	return BaseController.extend("ui5contacts.controller.Worklist", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the worklist controller is instantiated.
		 * @public
		 */
		onInit : function () {
			var oViewModel,
				iOriginalBusyDelay,
				oTable = this.byId("table");

			// Put down worklist table's original value for busy indicator delay,
			// so it can be restored later on. Busy handling on the table is
			// taken care of by the table itself.
			iOriginalBusyDelay = oTable.getBusyIndicatorDelay();
			// keeps the search state
			this._aTableSearchState = [];

			// Model used to manipulate control states
			oViewModel = new JSONModel({
				worklistTableTitle : this.getResourceBundle().getText("worklistTableTitle"),
				shareOnJamTitle: this.getResourceBundle().getText("worklistTitle"),
				shareSendEmailSubject: this.getResourceBundle().getText("shareSendEmailWorklistSubject"),
				shareSendEmailMessage: this.getResourceBundle().getText("shareSendEmailWorklistMessage", [location.href]),
				tableNoDataText : this.getResourceBundle().getText("tableNoDataText"),
				tableBusyDelay : 0
			});
			this.setModel(oViewModel, "worklistView");

			// Model used to save the currently editing Key or 
			// new key that is a random 32 bit string with ints and capital letters
			this.currentID = this._generateUUID();

			// Model used to set the "isEdting" state
			this.isEditing = false;

			// Model used to save the new contact item state
			this.contact = {
				Update_ems_ac : true,
				UUID : "",
				AccessID : "9000000055",
				AccessPassword : "9000000055",
				EMail : "",
				PUID : "",
				AadID : "aad1x",
				OrgID : "org1x",
				CreateAt : "\/Date(1614725122648+0000)\/",
				CreateBy : "",
				ChangeAt : "\/Date(1614725122648+0000)\/",
				ChangeBy : "",
				triedToSave : false
			};

			// Model used to let the fragment know if it has been edited yet
			// this.triedToSave = false;
			// this.setModel(this.triedToSave, "triedToSave");

			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			oTable.attachEventOnce("updateFinished", function(){
				// Restore original busy indicator delay for worklist's table
				oViewModel.setProperty("/tableBusyDelay", iOriginalBusyDelay);
			});
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Triggered by the table's 'updateFinished' event: after new table
		 * data is available, this handler method updates the table counter.
		 * This should only happen if the update was successful, which is
		 * why this handler is attached to 'updateFinished' and not to the
		 * table's list binding's 'dataReceived' method.
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished : function (oEvent) {
			// update the worklist's object counter after the table update
			var sTitle,
				oTable = oEvent.getSource(),
				iTotalItems = oEvent.getParameter("total");
			// only update the counter if the length is final and
			// the table is not empty
			if (iTotalItems && oTable.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("worklistTableTitleCount", [iTotalItems]);
			} else {
				sTitle = this.getResourceBundle().getText("worklistTableTitle");
			}
			this.getModel("worklistView").setProperty("/worklistTableTitle", sTitle);
		},

		/**
		 * Event handler when a table item gets pressed
		 * @param {sap.ui.base.Event} oEvent the table selectionChange event
		 * @public
		 */
		onPress : function (oEvent) {
			// The source is the list item that got pressed
			this._showObject(oEvent.getSource());
		},

		/**
		 * Event handler for navigating back.
		 * We navigate back in the browser history
		 * @public
		 */
		onNavBack : function() {
			// eslint-disable-next-line sap-no-history-manipulation
			history.go(-1);
		},

		onCreateScreenOpen : function() {
			if (!this.newContactDialog) {
				this.newContactDialog = sap.ui.xmlfragment("ui5contacts.view.fragment.CreateContact", this);
				const oModel = new sap.ui.model.json.JSONModel();
				this.newContactDialog.setModel(oModel);
			}

			// Update the contact state with a unique key
			this.contact.UUID = this.currentID;

			const contactData = JSON.parse(JSON.stringify(this.contact));
			this.newContactDialog.getModel().setData(contactData);
			this.newContactDialog.open();
		},

		onCreateScreenClose : function() {
			this.isEditing = false;
			this.newContactDialog.close();
		},

		// TODO: Update the view after create/edit contact
		onCreateScreenSave : function() {
			// Update the triedToSave state
			const oModel = this.newContactDialog.getModel();
			const newContact = oModel.getData();
			newContact.triedToSave = true;
			this.newContactDialog.getModel().setData(newContact);
			
			// Check if all mandatory fields are filled
			const isError = this._onSubmitCheck();
			if (isError) {
				return;
			}

			const oDataModel = new ODataModel("/sap/opu/odata/sap/ZC_PS_EMS_CONTACT_TP_CDS/");

			// Remove the triedToSave state variable from contract
			const contactBodyData = JSON.parse(JSON.stringify(newContact));
			delete contactBodyData.triedToSave;
			console.log(contactBodyData);
			
			// Check if this is an edit, and not a new contact creation
			if (this.isEditing) {
				oDataModel.update("/ZC_PS_EMS_CONTACT_TP(UUID=guid'" + contactBodyData.UUID + "')", contactBodyData, {
					success: function() {
						MessageToast.show("List updated successfully");
					},
					error: function() {
						MessageToast.show("Error updating list");
					}
				});
			} else {
				oDataModel.create("/ZC_PS_EMS_CONTACT_TP", contactBodyData, {
					success: function() {
						MessageToast.show("List created successfully");
					},
					error: function() {
						MessageToast.show("Error creating list");
					}
				});
				this.currentKey = this._generateUUID();
				console.log("New Key: " + this.currentKey);
			}
			
			// Apply the Odata changes to the view (without refreshing the view)
			this.isEditing = false;
			
			// Update the triedToSave state
			newContact.triedToSave = false;
			this.newContactDialog.getModel().setData(newContact);
			
			this.newContactDialog.close();
		},

		onSearch : function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
			} else {
				var aTableSearchState = [];
				var sQuery = oEvent.getParameter("query");

				if (sQuery && sQuery.length > 0) {
					aTableSearchState = [new Filter("EMail", FilterOperator.Contains, sQuery)];
				}
				this._applySearch(aTableSearchState);
			}
		},

		onDelete : function(oEvent) {
			const oDataModel = new ODataModel("/sap/opu/odata/sap/ZC_PS_EMS_CONTACT_TP_CDS/");
			const oContactItem = oEvent.getSource().getParent().getBindingContext().getObject();
			console.log(oContactItem.UUID)
			oDataModel.remove("/ZC_PS_EMS_CONTACT_TP(UUID=guid'" + oContactItem.UUID + "')");

			console.log('removed list with key: ' + oContactItem.UUID);
		},

		onEdit : function(oEvent) {
			if (!this.newContactDialog) {
				this.newContactDialog = sap.ui.xmlfragment("ui5contacts.view.fragment.CreateContact", this);
				const oModel = new sap.ui.model.json.JSONModel();
				this.newContactDialog.setModel(oModel);
			}

			this.isEditing = true;
			const oContactItem = oEvent.getSource().getParent().getBindingContext().getObject();
			this.newContactDialog.getModel().setData(oContactItem);
			this.newContactDialog.open();
		},

		/**
		 * Event handler for refresh event. Keeps filter, sort
		 * and group settings and refreshes the list binding.
		 * @public
		 */
		onRefresh : function () {
			var oTable = this.byId("table");
			oTable.getBinding("items").refresh();
		},

		/* =========================================================== */
		/* internal methods                                            */
		/* =========================================================== */

		/**
		 * Shows the selected item on the object page
		 * On phones a additional history entry is created
		 * @param {sap.m.ObjectListItem} oItem selected Item
		 * @private
		 */
		_showObject : function (oItem) {
			this.getRouter().navTo("object", {
				objectId: oItem.getBindingContext().getProperty("UUID")
			});
		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @param {sap.ui.model.Filter[]} aTableSearchState An array of filters for the search
		 * @private
		 */
		_applySearch: function(aTableSearchState) {
			var oTable = this.byId("table"),
				oViewModel = this.getModel("worklistView");
			oTable.getBinding("items").filter(aTableSearchState, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aTableSearchState.length !== 0) {
				oViewModel.setProperty("/tableNoDataText", this.getResourceBundle().getText("worklistNoDataWithSearchText"));
			}
		},

		_generateUUID : function() {
			let uuid = "";
			for (let i = 0; i < 36; i++) {
				if ( i == 8 || i == 13 || i == 18 || i == 23 ) {
					uuid += '-';
				} else {
					uuid += Math.floor(Math.random() * 16).toString(16);
				}
			}
			return uuid;
		},

		_onSubmitCheck: function() {
			const formData = this.newContactDialog.getModel().getData();
			let hasError = false;
		
			if (!formData.EMail || formData.EMail.length < 1) {
				hasError = true;
			}
			if (!formData.CreateBy || formData.CreateBy.length < 1) {
				hasError = true;
			}
			if (!formData.PUID || formData.PUID.length < 1) {
				hasError = true;
			}

			return hasError;
		},

	});
});