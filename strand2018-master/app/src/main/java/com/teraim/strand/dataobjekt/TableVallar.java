package com.teraim.strand.dataobjekt;

	import java.util.ArrayList;
import java.util.List;

import android.content.Context;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.EditText;
import android.widget.TableRow;
import android.widget.TextView;

import com.teraim.strand.R;
import com.teraim.strand.dataobjekt.InputAlertBuilder.AlertBuildHelper;

	public class TableVallar extends TableBase {


		//protected EditText e1,e2,e3,e4,e5,e6,e7,e8,e9,e10,e11,e12;
		protected int rowC = 0;
		protected final static int[] editviews = {R.id.e1,R.id.e2,R.id.e3,R.id.e4,R.id.e5,R.id.e6,R.id.e7,R.id.e8,R.id.e9,R.id.e10,R.id.e11,R.id.e12};
		protected final static int[] textviews = {R.id.c1,R.id.c2,R.id.c3,R.id.c4,R.id.c5,R.id.c6,R.id.c7,R.id.c8,R.id.c9,R.id.c10,R.id.c11,R.id.c12};

		protected final static String[] columnName = new String[] {"Driftnr","Position",
			"Bredd","Höjd","Längd","Tång (%)","Gren","Vegetation","Plast",
			"Övrigt skräp","Annueller","Perenner"};

		protected final static int NO_OF_COLS = 12;

		public TableVallar(Context c, Table data) {
			super(c,data);
			redraw(R.layout.row_vallar_table,textviews,columnName);
		}


		//Creates a row. Will also (side effect) create a new row in the Data Table.
		@Override
		public void addRow(String name) {
			/*
			String[] entries = new String[4];
			entries[0]="";
			entries[1]=name;
			entries[2]="";
			entries[3]="";
			String myID = myData.getNextId();
			addRow(myID,entries);
			myData.saveRow(myID, "",name,"","");
			*/
			String[] entries = new String[NO_OF_COLS];
			for (int i=0;i<NO_OF_COLS;i++)
				entries[i]="";
			entries[0]=name;
			addRow(myData.getNextId(),entries).performClick();
			
		}

		
		//creates a row. Will return the row number of the created row.

		protected TableRow addRow(final String myID, final String[] entries) {


			final TableRow row = createRow(R.layout.row_vallar_table);
			assert(row!=null);
			//Load
			int i=0;
			for(int id:textviews) 
				((TextView)row.findViewById(id)).setText(entries[i++]);

			row.setTag(myID);		
			row.setOnClickListener(

					InputAlertBuilder.createAlert(-1, "Vallar",null, 
							new AlertBuildHelper(TableVallar.this.getContext()){

						@Override
						public View createView() {
							View inputView = LayoutInflater.from(c).inflate(R.layout.vallar_table_popup,null);
							int i = 0;
							for(int id:textviews) 
								((EditText)inputView.findViewById(editviews[i++])).setText(((TextView)row.findViewById(id)).getText());
							
							return inputView;
						}

						@Override
						public void setResult(int resultId, View inputView,
								View outputView) {
							Log.d("Strand","Nu ska jag minsann spara!");
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

