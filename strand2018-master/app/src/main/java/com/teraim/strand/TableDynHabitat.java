package com.teraim.strand;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import android.content.Context;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TableRow;
import android.widget.TextView;

import com.teraim.strand.dataobjekt.InputAlertBuilder;
import com.teraim.strand.dataobjekt.InputAlertBuilder.AlertBuildHelper;
import com.teraim.strand.dataobjekt.Table;
import com.teraim.strand.dataobjekt.TableBase;
import com.teraim.strand.dataobjekt.TableHabitat;

public class TableDynHabitat extends TableBase {
	private int LANGD_KOLUMN = 3;
	int[] textviews = {R.id.kod,R.id.namn, R.id.utbredning, R.id.langd};
	int[] editviews = {R.id.e1,R.id.e2,R.id.e3,R.id.e4};
	protected final static int[] columnIds = new int[] {R.id.kod,R.id.namn, R.id.utbredning, R.id.langd,R.id.kriterie};
	protected final static String[] columnName = new String[] {"Kod","Namn","M.K","Längd","Kriterie"};

	String[] entries = {"Bebyggd strand","Påverkad av gräv/pirbygge/muddring",
			"Avverkning kraftig utglesning av träd","Hydrologi påverkad (ex. reglering)",
			"Området exploaterat eller bebyggt","Ej naturlig skog","Naturlig skog, men ålderskriterie ej uppfyllt"};
	List<String> values = new ArrayList<String>(Arrays.asList("13","14","15","16","17","18","19"));

	private Spinner sp_9999;
	private ArrayAdapter<String> altArrayAdapter;	
	
	TableHabitat tableH;
	public TableDynHabitat(Context c, Table data, TableHabitat tableH) {
		super(c, data);
		this.tableH=tableH;
		altArrayAdapter = new ArrayAdapter<String>(getContext(), android.R.layout.simple_spinner_dropdown_item, entries);		
		
		redraw(R.layout.row_dyn_table,columnIds,columnName);
	}

	@Override
	public void addRow(String name) {
		//Not used..
	}


	//nuvarande längd 
	int oldLength = 0;

	@Override
	protected TableRow addRow(final String myID, final String[] entries) {

		//checkfirst if this is special case.
		final TableRow row = createRow(R.layout.row_dyn_table);
		assert(row!=null);
		//Load
		int i=0;
		for(int id:columnIds) 
			((TextView)row.findViewById(id)).setText(entries[i++]);

		row.setTag(myID);	
		row.setOnClickListener(

				InputAlertBuilder.createAlert(-1, "Dyner",null, 
						new AlertBuildHelper(TableDynHabitat.this.getContext()){



					@Override
					public View createView() {
						boolean kriteria = entries[0].equals(ActivityHabitat.KOD_9999);
						int rowLayoutId = (kriteria)?R.layout.dyn_table_popup_9999:R.layout.dyn_table_popup;
						ScrollView inputView = (ScrollView)LayoutInflater.from(c).inflate(rowLayoutId,null);
						int i = 0;
						
						for(int id:textviews) {
							CharSequence text = ((TextView)row.findViewById(id)).getText();
							((EditText)inputView.findViewById(editviews[i++])).setText(text);
						}
						
						if(kriteria) {
							sp_9999 = (Spinner)inputView.findViewById(R.id.e5);
							sp_9999.setAdapter(altArrayAdapter);								
							sp_9999.setSelection(Strand.getInt(entries[4]), true);
							Log.d("Strand","no 5 was "+Strand.getInt(entries[4]));
						}

						return inputView;
					}

					@Override
					public void setResult(int resultId, View inputView,
							View outputView) {
						Log.d("Strand","Nu ska jag minsann spara!");
						List<String> ets = new ArrayList<String>();
						for(int id:editviews)
							ets.add(((EditText)inputView.findViewById(id)).getText().toString());
						//Add spinner if any.
						if (entries[0].equals(ActivityHabitat.KOD_9999))
							ets.add((String)sp_9999.getSelectedItem());
						else
							ets.add("");

						int i = 0;
						for(int id:columnIds) {
							((TextView)row.findViewById(id)).setText(ets.get(i));
							Log.d("Strand","Sätter värde "+ets.get(i));
							i++;
						}
						
						float oldL = 0;
						String[] rowD=myData.getRow(myID);
						if (rowD!=null) 
							oldL=Strand.getInt(rowD[LANGD_KOLUMN]);
						else
							Log.d("Strand","rowD was null for ID "+myID+" rowcount "+myData.getRowCount());
						
						float newL = Strand.getFloat(ets.get(LANGD_KOLUMN));				
						myData.saveRow(myID,ets);
						
						tableH.setDynHabLen(String.valueOf(newL-oldL));
						Log.d("Strand","Changed dynhablengd") ;

					}}, row)
				);
		row.setOnLongClickListener(new OnLongClickListener() {

			@Override
			public boolean onLongClick(View arg0) {
				Log.d("Strand","This gets fired");
				//need to also subtract the distance from all other rows.
				TextView tv= (TextView)row.findViewById(R.id.langd);
				float len = 0;
				if(tv.getText()!=null && tv.getText().length()>0) 
					len = Float.parseFloat(tv.getText().toString());
				Log.d("Strand","Removed row with len "+len);
				tableH.setDynHabLen(String.valueOf(-len));
				
				removeRow(row);

				return true;
			}});


		addView(row);
		return row;
	}



	
	public TableRow addRow(String kod, String name, String utbredning) {
		String[] entries = new String[5];
		entries[0]=kod;
		//The special case..
		entries[1]=name;
		entries[2]=utbredning;
		//längd
		entries[3]="";	
		//kriterie
		entries[4]="";	
		String myID = myData.getNextId();
		TableRow row = addRow(myID,entries);		
		row.performClick();		
		myData.saveRow(myID, kod,name,utbredning,"","");
		return row;
	}
	
	

	
	
}