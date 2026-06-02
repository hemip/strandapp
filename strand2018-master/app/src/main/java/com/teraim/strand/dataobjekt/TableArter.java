package com.teraim.strand.dataobjekt;

import java.util.ArrayList;
import java.util.List;

import android.content.Context;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.TableRow;
import android.widget.TextView;

import com.teraim.strand.R;
import com.teraim.strand.Strand;
import com.teraim.strand.dataobjekt.InputAlertBuilder.AlertBuildHelper;

public class TableArter extends TableBase {

	protected final static int[] columnIds = new int[] {R.id.namn, R.id.geo, R.id.supra,R.id.extra,R.id.drift};
	int[] inputviews = new int[] {R.id.geo,R.id.supra,R.id.extra,R.id.drift};
	int[] editviews = new int[] {R.id.geoE,R.id.supraE,R.id.extraE,R.id.driftE};
	int[] chkboxes = new int[] {R.id.geoCB,R.id.supraCB,R.id.extraCB,R.id.driftCB};
	protected final static String[] columnName = new String[] {"NAMN","GEO","SUPRA","EXTRA","DRIFT"};
	//private CheckBox supraCB,geoCB,extraCB;
	//private EditText supraE,geoE,extraE;
//	private TextView artT,supraT,geoT,extraT,driftT;


	public TableArter(Context c, Table data) {
		super(c,data);
		redraw(R.layout.row_arter_table,columnIds,columnName);

	}

	@Override
	public void addRow(String name) {

		String[] entries = new String[5];
		entries[0]=name;
		entries[1]="";
		entries[2]="";
		entries[3]="";
		entries[4]="";
		String myID = myData.getNextId();
		addRow(myID,entries).performClick();
		myData.saveRow(myID, name,"","","","");
		

	}

	/*
		TableRow row = super.createRow(R.layout.row_arter_table);
		assert(row!=null);
		((TextView)row.findViewById(R.id.namn)).setText(name);;
		addView(row)	 
	 */

	@Override
	public TableRow addRow(final String myID, final String[] entries) {
		final TableRow row = super.createRow(R.layout.row_arter_table);
		assert(row!=null);

		int i=0;
		for(int id:columnIds) 
			((TextView)row.findViewById(id)).setText(entries[i++]);

		row.setTag(myID);	

		//Before creating the AlertDialog, we need to find out what kind this is.
		//Three kinds: Existence (default), Coverage% (T), Amount(R/RT).

		ArtListaProvider ap = Strand.getArtListaProvider();
		final ArtListEntry ale = (ap!=null)?ap.getArt(entries[0]):null;
		if (ale==null || ale.isExistence()) {
			Log.d("Strand","Entries0 : "+entries[0]);
			if (ale == null)
				Log.e("Strand", "Could not find ART in TableArter. ALE was null");
			row.setOnClickListener(

					InputAlertBuilder.createAlert(-1, "Fältskikt","Inmatning för "+entries[0]+". Kryssa för litoral där art återfunnits.", 
							new AlertBuildHelper(TableArter.this.getContext()){

						@Override
						public View createView() {
							View inputView = LayoutInflater.from(c).inflate(R.layout.arter_table_popup,null);
							//supraCB = (CheckBox)inputView.findViewById(R.id.supraCB);
							//geoCB = (CheckBox)inputView.findViewById(R.id.geoCB);
							//extraCB = (CheckBox)inputView.findViewById(R.id.extraCB);		
							int i = 0;
							for(int id:inputviews) 
								((CheckBox)inputView.findViewById(chkboxes[i++])).setChecked(((TextView)row.findViewById(id)).getText().equals("X"));
						
							return inputView;
						}

						@Override
						public void setResult(int resultId, View inputView,
								View outputView) {
							
							List<Boolean> ets = new ArrayList<Boolean>();
							List<String> etss = new ArrayList<String>();
							
							for(int id:chkboxes)
								ets.add(((CheckBox)inputView.findViewById(id)).isChecked());
							int i = 0;
							String x;
							for(int id:inputviews)  {							
								x = ets.get(i)?"X":"";
								etss.add(i, x);
								((TextView)row.findViewById(id)).setText(etss.get(i));
								i++;
							}
							Log.d("Strand","Entries0x : "+entries[0]);
							etss.add(0,entries[0]);
							myData.saveRow(myID,etss);
							
							/*
							TextView supraT,geoT,extraT;
							supraT = (TextView)outputView.findViewById(R.id.supra);
							geoT = (TextView)outputView.findViewById(R.id.geo);
							extraT = (TextView)outputView.findViewById(R.id.extra);
							String sup=checkBoxToString(supraCB.isChecked());
							String geo=checkBoxToString(geoCB.isChecked());
							String ext=checkBoxToString(extraCB.isChecked());
							supraT.setText(sup);
							geoT.setText(geo);
							extraT.setText(ext);					
							myData.saveRow(myID,entries[0],sup,geo,ext);
							*/
						}
	
						}, row)
					);	
		}

		if (ale!=null && (ale.isCount()||ale.isCoverage())) {
			row.setOnClickListener(

					InputAlertBuilder.createAlert(-1, "Fältskikt","Inmatning för "+entries[0]+
							(ale.isCount()?". Ange antal per zon.":". Ange procent täckning"), 
							new AlertBuildHelper(TableArter.this.getContext()){

						@Override
						public View createView() {
							View inputView = null;
							//Put a % sign into the Header if coverage.
							if (ale.isCount())
								inputView = LayoutInflater.from(c).inflate(R.layout.arter_table_count_popup,null);
							else
								inputView = LayoutInflater.from(c).inflate(R.layout.arter_table_coverage_popup,null);
							
							int i = 0;
							
							for(int id:inputviews) {
								((EditText)inputView.findViewById(editviews[i++])).setText(((TextView)row.findViewById(id)).getText());
							}
							return inputView;

							
						}

						@Override
						public void setResult(int resultId, View inputView,
								View outputView) {

							/*
							TextView supraT,geoT,extraT;
							supraT = (TextView)outputView.findViewById(R.id.supra);
							geoT = (TextView)outputView.findViewById(R.id.geo);
							extraT = (TextView)outputView.findViewById(R.id.extra);
							String sup=supraE.getText().toString();
							String geo=geoE.getText().toString();
							String ext=extraE.getText().toString();
							supraT.setText(sup);
							geoT.setText(geo);
							extraT.setText(ext);					
							myData.saveRow(myID,entries[0],sup,geo,ext);
							*/
							
							List<String> ets = new ArrayList<String>();
							
							for(int id:editviews)
								ets.add(((EditText)inputView.findViewById(id)).getText().toString());
							int i = 0;
							for(int id:inputviews)  {
								((TextView)row.findViewById(id)).setText(ets.get(i));
								Log.d("Strand","Sätter värde "+ets.get(i));
								i++;
							}
							ets.add(0,entries[0]);
							myData.saveRow(myID,ets);
						}


					}, row)
					);	
		}

		row.setOnLongClickListener(new OnLongClickListener() {

			@Override
			public boolean onLongClick(View disc) {
				removeRow(row);
				return true;
			}});


		addView(row);
		return row;
		
	}





}
