package com.teraim.strand.dataobjekt;
import java.util.Map.Entry;
import java.util.Set;

import android.content.Context;
import android.graphics.Typeface;
import android.util.Log;
import android.view.LayoutInflater;
import android.widget.TableLayout;
import android.widget.TableRow;
import android.widget.TextView;

public abstract class TableBase extends TableLayout {
	
	protected Table myData;
	
		
	public TableBase(Context c,Table data) {
		super(c);
		myData = data;
	}
	
	protected void createHeader(int rowId, int[] columnIds, String[] columnName) {
		int i = 0;
		TableRow header  = createRow(rowId);
		addView(header);
		TextView tv;
		for(int id:columnIds) {
			tv = (TextView)header.findViewById(id);
			if (tv == null) 
				Log.e("Strand","Did not find column "+columnName[i]);
			Log.e("Strand","Adding column "+columnName[i]);
			tv.setText(columnName[i++]);	
			tv.setTypeface(null,Typeface.BOLD);
		}
		
	}
	
	
	public TableRow createRow(int resId) {	
		return (TableRow)LayoutInflater.from(getContext()).inflate(resId,null);
	}
	
	//Convenience...translate Entry into key-value.
	protected void addRow(Entry<String, String[]> row) {
		Log.d("Strand","Trying to add "+row.getValue().toString());
		addRow(row.getKey(),row.getValue());
	}
	
	
	public abstract void addRow(String name);
	
	protected abstract TableRow addRow(final String myID, final String[] entries);
	
	public void redraw(int headerLayoutId, int[] colIDs, String[] colNames) {
		this.removeAllViews();
		createHeader(headerLayoutId,colIDs,colNames);
			Set<Entry<String, String[]>> rows =  myData.getTable();
		if (rows!=null)
			for(Entry<String, String[]> row:rows) {
				addRow(row);
			}
	}
	
	public void removeRow(TableRow row) {
		myData.deleteRow((String)row.getTag());
		removeView(row);		
	}
}
