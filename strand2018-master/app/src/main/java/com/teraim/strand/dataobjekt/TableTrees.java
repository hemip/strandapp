package com.teraim.strand.dataobjekt;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map.Entry;
import java.util.Set;

import android.content.Context;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.EditText;
import android.widget.TableRow;
import android.widget.TextView;

import com.teraim.strand.R;
import com.teraim.strand.dataobjekt.InputAlertBuilder.AlertBuildHelper;

public class TableTrees extends TableBase {

	protected int rowC = 0;

	protected final static int[] columnIds = new int[] {R.id.avst, R.id.art, R.id.diameter,R.id.antal};
	protected final static int[] textviews = columnIds;
	protected final static int[] editviews = textviews;
	protected final static String[] columnName = new String[] {"Avstånd","Art","Diameter","Antal"};


	public TableTrees(Context c, Table data) {
		super(c,data);
		redraw(R.layout.row_trees_table,columnIds,columnName);
	}


	//Creates a row. Will also (side effect) create a new row in the Data Table.
	@Override
	public void addRow(String name) {
		String[] entries = new String[4];
		entries[0]="";
		entries[1]=name;
		entries[2]="";
		entries[3]="";
		String myID = myData.getNextId();
		addRow(myID,entries).performClick();
		myData.saveRow(myID, "",name,"","");
	}

	
	//creates a row. Will return the row number of the created row.

	protected TableRow addRow(final String myID, final String[] entries) {


		final TableRow row = super.createRow(R.layout.row_trees_table);
		assert(row!=null);
		//Load
		int i=0;
		assert(entries.length==4);
		for(int id:columnIds) 
			((TextView)row.findViewById(id)).setText(entries[i++]);

		row.setTag(myID);		
		row.setOnClickListener(

				InputAlertBuilder.createAlert(-1, "Träd","Inmatning för "+entries[1]+". Vänligen mata in antingen antal eller diameter. Inte både och!", 
						new AlertBuildHelper(TableTrees.this.getContext()){

					@Override
					public View createView() {
						View inputView = LayoutInflater.from(c).inflate(R.layout.tree_table_popup,null);
						int i = 0;
						for(int id:textviews) 
							((EditText)inputView.findViewById(editviews[i++])).setText(((TextView)row.findViewById(id)).getText());
	
						return inputView;
					}

					@Override
					public void setResult(int resultId, View inputView,
							View outputView) {
						List<String> ets = new ArrayList<String>();
						for(int id:editviews)
							ets.add(((EditText)inputView.findViewById(id)).getText().toString());
						int i = 0;
						for(int id:textviews)  {
							((TextView)row.findViewById(id)).setText(ets.get(i));
							Log.d("Strand","Sätter värde "+ets.get(i));
							i++;
						}
						myData.saveRow(myID,ets);
						
						
						/*
						TextView avstT,antalT,diameterT;
						avstT = (TextView)outputView.findViewById(R.id.avst);
						antalT = (TextView)outputView.findViewById(R.id.antal);
						diameterT = (TextView)outputView.findViewById(R.id.diameter);

						avstT.setText(avstE.getText());
						antalT.setText(antalE.getText());
						diameterT.setText(diameterE.getText());
						String avst = "",ant="",diam="",art="";
						if(avstE.getText()!=null)
							avst = avstE.getText().toString();
						if(antalE.getText()!=null)
							ant = antalE.getText().toString();
						if(diameterE.getText()!=null)
							diam = diameterE.getText().toString();
						art = entries[1];
						myData.saveRow(myID,avst,art,ant,diam);
						*/

					}}, row)
				);		
		row.setOnLongClickListener(new OnLongClickListener() {

			@Override
			public boolean onLongClick(View arg0) {
				removeRow(row);
				return true;
			}});


		addView(row);
		return row;
	}










	


}
